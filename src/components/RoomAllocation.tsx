import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Home, Users, AlertTriangle, Crown, UserCheck, Filter, Lock, Unlock, UserX, AlertCircle } from 'lucide-react';
import type { Student } from '../types/student';
import type { User } from '../types/auth';
import { supabase } from '../supabaseClient';
import './RoomAllocation.css';

interface Room {
  roomNumber: number;
  students: Student[];
  genderType: 'Nữ' | 'Nam' | 'Trống';
  hasPenalized: boolean;
  matchedStudents?: Student[];
  hasMatch?: boolean;
}

interface RoomAllocationProps {
  students: Student[];
  setStudents?: React.Dispatch<React.SetStateAction<Student[]>>;
  onSetRoomLeader?: (leaderStudentId: string | null, roomStudentKeys: string[]) => void;
  onUpdateRoomData?: (roomAssignments: { studentKey: string; roomNumber: number }[]) => void;
  currentUser?: (User & { can_manage?: boolean }) | null;
}

export const RoomAllocation: React.FC<RoomAllocationProps> = ({
  students,
  setStudents,
  onSetRoomLeader,
  onUpdateRoomData,
  currentUser,
}) => {
  const MAX_PER_ROOM = 12;
  const INITIAL_ROOMS = 20;

  const [leaders, setLeaders] = useState<Record<number, string>>({});
  const [activeDropdownRoom, setActiveDropdownRoom] = useState<number | null>(null);
  
  const [teacherList, setTeacherList] = useState<string[]>([]);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');

  // State quản lý Modal xác nhận xóa sinh viên đẹp hơn
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(() => {
    const savedLock = localStorage.getItem('KTX_IS_ROOM_LOCKED');
    return savedLock === 'true';
  });

  const [lockedRoomsData, setLockedRoomsData] = useState<Room[] | null>(() => {
    const savedData = localStorage.getItem('KTX_LOCKED_ROOMS_DATA');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    let isMounted = true;
    const fetchTeachersFromDatabase = async () => {
      try {
        const { data, error } = await supabase
          .from('User')
          .select('HoTen');

        if (error) {
          console.error('Lỗi khi tải danh sách HoTen từ bảng User:', error.message);
          return;
        }

        if (data && isMounted) {
          const uniqueNames = Array.from(
            new Set(
              data
                .map((item: any) => item.HoTen)
                .filter((name: string) => name && name.trim() !== '')
            )
          ).sort() as string[];

          setTeacherList(uniqueNames);
        }
      } catch (err) {
        console.error('Lỗi kết nối lấy HoTen:', err);
      }
    };

    fetchTeachersFromDatabase();
    return () => {
      isMounted = false;
    };
  }, []);

  const canManage = useMemo(() => {
    return currentUser 
      ? (currentUser.role === 'admin' || currentUser.can_manage === true) 
      : true;
  }, [currentUser]);

  const calculateRoomAllocation = useCallback((): Room[] => {
    const allValidStudents = students.filter((s: any) => {
      if (s.isAbsent) return false;
      return true; 
    });

    const sortWithinGender = (group: Student[]) => {
      const regular = group.filter((s) => !s.isLate);
      const late = group
        .filter((s) => s.isLate)
        .sort((a, b) => {
          const timeA = a.late_at ? new Date(a.late_at).getTime() : 0;
          const timeB = b.late_at ? new Date(b.late_at).getTime() : 0;

          if (timeA !== timeB) return timeA - timeB;

          const idA = String(a.MSSV || a.id || '');
          const idB = String(b.MSSV || b.id || '');
          return idA.localeCompare(idB);
        });

      return [...regular, ...late];
    };

    const sortedFemales = sortWithinGender(allValidStudents.filter((s) => s.gender === 'Nữ'));
    const sortedMales = sortWithinGender(allValidStudents.filter((s) => s.gender !== 'Nữ'));

    let totalRoomsNeeded = Math.ceil(allValidStudents.length / MAX_PER_ROOM);
    if (totalRoomsNeeded < INITIAL_ROOMS) {
      totalRoomsNeeded = INITIAL_ROOMS;
    }

    const rooms: Room[] = Array.from({ length: totalRoomsNeeded }, (_, i) => ({
      roomNumber: i + 1,
      students: [],
      genderType: 'Trống',
      hasPenalized: false,
    }));

    let currentRoomIdx = 0;

    const fillGroupToRooms = (group: Student[], gender: 'Nữ' | 'Nam') => {
      if (group.length === 0) return;

      if (
        rooms[currentRoomIdx].students.length > 0 &&
        (rooms[currentRoomIdx].genderType !== gender ||
          rooms[currentRoomIdx].students.length >= MAX_PER_ROOM)
      ) {
        currentRoomIdx++;
      }

      for (const student of group) {
        if (currentRoomIdx >= rooms.length) {
          rooms.push({
            roomNumber: rooms.length + 1,
            students: [],
            genderType: 'Trống',
            hasPenalized: false,
          });
        }

        if (rooms[currentRoomIdx].students.length >= MAX_PER_ROOM) {
          currentRoomIdx++;
          if (currentRoomIdx >= rooms.length) {
            rooms.push({
              roomNumber: rooms.length + 1,
              students: [],
              genderType: 'Trống',
              hasPenalized: false,
            });
          }
        }

        rooms[currentRoomIdx].students.push(student);
        rooms[currentRoomIdx].genderType = gender;
        
        if (student.isLate) {
          rooms[currentRoomIdx].hasPenalized = true;
        }
      }

      if (rooms[currentRoomIdx].students.length > 0) {
        currentRoomIdx++;
      }
    };

    fillGroupToRooms(sortedFemales, 'Nữ');
    fillGroupToRooms(sortedMales, 'Nam');

    return rooms;
  }, [students, MAX_PER_ROOM, INITIAL_ROOMS]);

  const calculatedRooms = useMemo(() => {
    return calculateRoomAllocation();
  }, [calculateRoomAllocation]);

  useEffect(() => {
    let isMounted = true;
    const checkRoomLockStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('RoomConfig')
          .select('*')
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Lỗi tải trạng thái khóa từ RoomConfig:', error.message);
          return;
        }

        if (data && isMounted) {
          if (data.isLocked === true) {
            setIsRoomLocked(true);
            localStorage.setItem('KTX_IS_ROOM_LOCKED', 'true');
            
            setLockedRoomsData(prev => {
              if (!prev) {
                const newLockedState = calculateRoomAllocation();
                localStorage.setItem('KTX_LOCKED_ROOMS_DATA', JSON.stringify(newLockedState));
                return newLockedState;
              }
              return prev;
            });
          } else {
            setIsRoomLocked(false);
            localStorage.setItem('KTX_IS_ROOM_LOCKED', 'false');
            localStorage.removeItem('KTX_LOCKED_ROOMS_DATA');
            setLockedRoomsData(null);
          }
        }
      } catch (err) {
        console.error('Lỗi kết nối RoomConfig:', err);
      }
    };

    if (students.length > 0) {
      checkRoomLockStatus();
    }
    return () => {
      isMounted = false;
    };
  }, [students.length, calculateRoomAllocation]);

  // Hàm thực hiện xóa sinh viên sau khi bấm nút Đồng ý trên Modal
  const confirmDeleteStudent = async () => {
    if (!studentToDelete || !canManage) return;

    setIsDeleting(true);
    const studentKey = String(studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id);

    try {
      const mssvValue = studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id;

      const { error } = await supabase
        .from('DanhSachSinhVien')
        .delete()
        .eq('MSSV', mssvValue);

      if (error) {
        console.error('Lỗi xóa sinh viên từ Supabase:', error.message);
        alert('Lỗi khi xóa khỏi CSDL: ' + error.message);
        setIsDeleting(false);
        return;
      }
    } catch (err) {
      console.error('Lỗi kết nối:', err);
      setIsDeleting(false);
      return;
    }

    if (setStudents) {
      setStudents((prevStudents) =>
        prevStudents.filter((s) => {
          const sKey = String(s.MSSV || (s as any).studentId || s.id);
          return sKey !== studentKey;
        })
      );
    }

    if (isRoomLocked && lockedRoomsData) {
      const updatedLockedRooms = lockedRoomsData.map(room => ({
        ...room,
        students: room.students.filter((st: any) => {
          const sKey = String(st.MSSV || st.studentId || st.id);
          return sKey !== studentKey;
        })
      }));
      setLockedRoomsData(updatedLockedRooms);
      localStorage.setItem('KTX_LOCKED_ROOMS_DATA', JSON.stringify(updatedLockedRooms));
    }

    setIsDeleting(false);
    setStudentToDelete(null);
  };

  const toggleLockRooms = async () => {
    if (!canManage) return;

    if (!isRoomLocked) {
      const lockedState = calculateRoomAllocation();
      setLockedRoomsData(lockedState);
      setIsRoomLocked(true);

      localStorage.setItem('KTX_IS_ROOM_LOCKED', 'true');
      localStorage.setItem('KTX_LOCKED_ROOMS_DATA', JSON.stringify(lockedState));

      try {
        await supabase.from('RoomConfig').upsert({ id: 1, isLocked: true });
      } catch (err) {
        console.error('Lỗi kết nối:', err);
      }
    } else {
      setLockedRoomsData(null);
      setIsRoomLocked(false);

      localStorage.setItem('KTX_IS_ROOM_LOCKED', 'false');
      localStorage.removeItem('KTX_LOCKED_ROOMS_DATA');

      try {
        await supabase.from('RoomConfig').upsert({ id: 1, isLocked: false });
      } catch (err) {
        console.error('Lỗi kết nối:', err);
      }
    }
  };

  const getRoomsToDisplay = useMemo(() => {
    if (!isRoomLocked || !lockedRoomsData) {
      return calculatedRooms;
    }

    return lockedRoomsData.map(room => ({
      ...room,
      students: room.students
        .map(lockedStudent => {
          const freshStudent = students.find(s => 
            String(s.MSSV || (s as any).studentId || (s as any).id) === String(lockedStudent.MSSV || (lockedStudent as any).studentId || (lockedStudent as any).id)
          );
          return freshStudent || null;
        })
        .filter(Boolean) as Student[]
    }));
  }, [isRoomLocked, lockedRoomsData, calculatedRooms, students]);

  const rooms = getRoomsToDisplay;

  const filteredRooms = useMemo(() => {
    return rooms.map((room) => {
      if (!selectedTeacherFilter) return room;
      const matchedStudents = room.students.filter((st: any) => {
        const studentTeacher = st.thayCo || st.HoTen || st.hoTen;
        return studentTeacher === selectedTeacherFilter;
      });
      return {
        ...room,
        matchedStudents,
        hasMatch: matchedStudents.length > 0
      };
    }).filter((room) => !selectedTeacherFilter || room.hasMatch);
  }, [rooms, selectedTeacherFilter]);

  useEffect(() => {
    if (!onUpdateRoomData || isRoomLocked) return;

    const assignments: { studentKey: string; roomNumber: number }[] = [];
    rooms.forEach((room) => {
      room.students.forEach((st: any) => {
        const studentKey = String(st.MSSV || st.studentId || st.id);
        assignments.push({ studentKey, roomNumber: room.roomNumber });
      });
    });

    onUpdateRoomData(assignments);
  }, [rooms, onUpdateRoomData, isRoomLocked]);

  useEffect(() => {
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = room.students.find((st: any) => st.truongPhong === 'x');
      if (leaderStudent) {
        const studentKey = String(leaderStudent.MSSV || leaderStudent.studentId || leaderStudent.id);
        loadedLeaders[room.roomNumber] = studentKey;
      }
    });
    setLeaders(loadedLeaders);
  }, [rooms]);

  const handleSelectLeader = (roomNumber: number, studentKey: string) => {
    if (!canManage) return;
    setLeaders((prev) => ({ ...prev, [roomNumber]: studentKey }));
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st: any) => String(st.MSSV || st.studentId || st.id));

    if (onSetRoomLeader) {
      onSetRoomLeader(studentKey, roomStudentKeys);
    }
  };

  const handleRemoveLeader = (roomNumber: number) => {
    if (!canManage) return;
    setLeaders((prev) => {
      const updated = { ...prev };
      delete updated[roomNumber];
      return updated;
    });
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st: any) => String(st.MSSV || st.studentId || st.id));

    if (onSetRoomLeader) {
      onSetRoomLeader(null, roomStudentKeys);
    }
  };

  const totalActiveAllocated = useMemo(() => {
    return rooms.reduce((acc, r) => acc + r.students.length, 0);
  }, [rooms]);

  const totalPenalized = useMemo(() => {
    return students.filter((s: any) => s.isAbsent || s.isLate).length;
  }, [students]);

  return (
    <div className="room-container">
      <div className="room-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Sơ Đồ Phòng KTX QPAN ({filteredRooms.length}/{rooms.length} Phòng)
            {isRoomLocked && (
              <span style={{ fontSize: '12px', background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', border: '1px solid #f87171' }}>
                🔒 Đã khóa sơ đồ (Giữ nguyên vị trí phòng)
              </span>
            )}
          </h2>
          <p>
            {isRoomLocked 
              ? 'Phòng đã được khóa cố định. Nút "Nghỉ" đang hiển thị để xóa vĩnh viễn sinh viên khỏi CSDL.' 
              : 'Đang ở chế độ tự động phân phòng. Hãy bấm "Khóa Cố Định Phòng" để hiển thị nút xóa nghỉ.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {canManage && (
            <button
              type="button"
              onClick={toggleLockRooms}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                border: isRoomLocked ? '1px solid #dc2626' : '1px solid #2563eb',
                background: isRoomLocked ? '#fef2f2' : '#eff6ff',
                color: isRoomLocked ? '#dc2626' : '#2563eb',
              }}
            >
              {isRoomLocked ? <Lock size={16} /> : <Unlock size={16} />}
              {isRoomLocked ? 'Mở Khóa Phòng' : 'Khóa Cố Định Phòng'}
            </button>
          )}

          <div className="room-stats">
            <div className="stat-card">
              <Users size={18} color="#2563eb" />
              <span>Đang ở: <strong>{totalActiveAllocated}</strong> SV</span>
            </div>
            <div className="stat-card warning">
              <AlertTriangle size={18} color="#dc2626" />
              <span>Trễ/Vắng: <strong>{totalPenalized}</strong> SV</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: '#f8fafc',
        padding: '12px 18px',
        borderRadius: '8px',
        border: '1px solid #cbd5e1',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155', fontWeight: 600, fontSize: '14px' }}>
          <Filter size={18} color="#2563eb" />
          <span>Lọc theo HoTen (Bảng User):</span>
        </div>

        <select
          value={selectedTeacherFilter}
          onChange={(e) => setSelectedTeacherFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #94a3b8',
            outline: 'none',
            fontSize: '14px',
            background: '#ffffff',
            minWidth: '240px',
            cursor: 'pointer',
            color: '#1e293b',
            fontWeight: 500
          }}
        >
          <option value="">-- Tất cả HoTen (Hiện toàn bộ phòng) --</option>
          {teacherList.map((hoTen) => (
            <option key={hoTen} value={hoTen}>
              {hoTen}
            </option>
          ))}
        </select>

        {selectedTeacherFilter && (
          <button
            type="button"
            onClick={() => setSelectedTeacherFilter('')}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #ef4444',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ✕ Bỏ lọc
          </button>
        )}
      </div>

      <div className="rooms-grid">
        {filteredRooms.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            Không tìm thấy phòng nào khớp với HoTen: <strong>{selectedTeacherFilter}</strong>.
          </div>
        ) : (
          filteredRooms.map((room) => {
            const activeRoomStudents = room.students;
            const isFull = activeRoomStudents.length === MAX_PER_ROOM;
            const isEmpty = activeRoomStudents.length === 0;
            const currentLeaderKey = leaders[room.roomNumber];
            const isDropdownOpen = activeDropdownRoom === room.roomNumber;

            return (
              <div
                key={room.roomNumber}
                className={`room-card ${isEmpty ? 'empty' : ''} ${room.hasPenalized ? 'penalized-room' : ''}`}
                style={{ position: 'relative' }}
              >
                <div className="room-card-header">
                  <div className="room-title">
                    <Home size={18} />
                    <span>Phòng {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {!isEmpty && (
                      <span className={`gender-tag ${room.genderType === 'Nữ' ? 'nu' : 'nam'}`}>
                        Phòng {room.genderType}
                      </span>
                    )}

                    {!isEmpty && canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDropdownRoom(isDropdownOpen ? null : room.roomNumber)
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: '1px solid #cbd5e1',
                          background: currentLeaderKey ? '#fef9c3' : '#ffffff',
                          color: currentLeaderKey ? '#854d0e' : '#475569',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {currentLeaderKey ? (
                          <>
                            <Crown size={13} color="#eab308" />
                            <span>TP</span>
                          </>
                        ) : (
                          <>
                            <UserCheck size={13} />
                            <span>Xét TP</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isDropdownOpen && !isEmpty && canManage && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '42px',
                      right: '12px',
                      zIndex: 20,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      padding: '6px',
                      minWidth: '200px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#64748b',
                        padding: '4px 8px',
                        borderBottom: '1px solid #f1f5f9',
                        marginBottom: '4px',
                      }}
                    >
                      CHỌN TRƯỞNG PHÒNG
                    </div>

                    {currentLeaderKey && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLeader(room.roomNumber)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          fontSize: '12px',
                          color: '#dc2626',
                          background: '#fef2f2',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          marginBottom: '4px',
                          fontWeight: 600,
                        }}
                      >
                        ✕ Hủy vị trí Trưởng phòng
                      </button>
                    )}

                    {activeRoomStudents.map((st: any, idx: number) => {
                      const studentKey = String(st.MSSV || st.studentId || st.id);
                      const isSelected = currentLeaderKey === studentKey;

                      return (
                        <button
                          key={studentKey + '-' + idx}
                          type="button"
                          onClick={() => handleSelectLeader(room.roomNumber, studentKey)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            fontSize: '12px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: isSelected ? '#fefce8' : 'transparent',
                            color: isSelected ? '#854d0e' : '#334155',
                            fontWeight: isSelected ? 700 : 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>
                            {idx + 1}. {st.name}
                          </span>
                          {isSelected && <Crown size={12} color="#eab308" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="room-capacity">
                  <span>Sức chứa: <strong>{activeRoomStudents.length}/{MAX_PER_ROOM}</strong></span>
                  <span className={`status-pill ${isFull ? 'full' : isEmpty ? 'free' : 'available'}`}>
                    {isFull ? 'Đã Đầy' : isEmpty ? 'Trống' : 'Còn Chỗ'}
                  </span>
                </div>

                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(activeRoomStudents.length / MAX_PER_ROOM) * 100}%`,
                      backgroundColor: room.hasPenalized
                        ? '#ef4444'
                        : room.genderType === 'Nữ'
                        ? '#ec4899'
                        : '#3b82f6',
                    }}
                  />
                </div>

                <div className="room-student-list">
                  {room.students.length === 0 ? (
                    <div className="empty-text">Phòng trống</div>
                  ) : (
                    room.students.map((st: any, idx) => {
                      const studentKey = String(st.MSSV || st.studentId || st.id);
                      const displayCode = st.MSSV || st.studentId || st.id; 
                      const isLeader = currentLeaderKey === studentKey;
                      const isPenalized = st.isLate;
                      const studentTeacher = st.thayCo || st.HoTen || st.hoTen;
                      const isTeacherMatch = selectedTeacherFilter ? studentTeacher === selectedTeacherFilter : true;

                      return (
                        <div
                          key={studentKey + '-' + idx}
                          className={`student-item ${isPenalized ? 'bad-student' : ''}`}
                          style={{
                            backgroundColor: isLeader 
                              ? '#fefce8' 
                              : (selectedTeacherFilter && isTeacherMatch ? '#eff6ff' : undefined),
                            borderColor: isLeader 
                              ? '#fde047' 
                              : (selectedTeacherFilter && isTeacherMatch ? '#bfdbfe' : undefined),
                            opacity: selectedTeacherFilter && !isTeacherMatch ? 0.4 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            padding: '6px 8px'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: '0' }}>
                            <span
                              className="st-name"
                              style={{
                                color: isLeader ? '#854d0e' : (isTeacherMatch && selectedTeacherFilter ? '#1e40af' : undefined),
                                fontWeight: isLeader || (isTeacherMatch && selectedTeacherFilter) ? 700 : undefined,
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {isLeader && (
                                <Crown
                                  size={14}
                                  color="#eab308"
                                  style={{ marginRight: 4, verticalAlign: 'middle' }}
                                />
                              )}
                              {idx + 1}. {st.name} ({displayCode})
                            </span>
                            {studentTeacher && <span style={{ fontSize: '10px', color: '#64748b' }}>GV: {studentTeacher}</span>}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {st.isLate && <span className="tag-bad late" style={{ fontSize: '10px', padding: '1px 4px' }}>Trễ</span>}
                            
                            {/* Nút Nghỉ chỉ hiện khi phòng đã được KHÓA CỐ ĐỊNH */}
                            {canManage && isRoomLocked && (
                              <button
                                type="button"
                                onClick={() => setStudentToDelete(st)}
                                title="Xóa vĩnh viễn sinh viên này ra khỏi database"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #f87171',
                                  padding: '3px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                <UserX size={12} />
                                <span>Nghỉ</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* --- CUSTOM MODAL THÔNG BÁO XÁC NHẬN XÓA ĐẸP MẮT --- */}
      {studentToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            animation: 'modalScaleIn 0.2s ease-out'
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '24px 24px 16px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px'
            }}>
              <div style={{
                backgroundColor: '#fee2e2',
                padding: '12px',
                borderRadius: '12px',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#0f172a'
                }}>
                  Xác nhận xóa sinh viên
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#64748b',
                  lineHeight: '1.5'
                }}>
                  Bạn có chắc chắn muốn xóa vĩnh viễn sinh viên <strong style={{ color: '#0f172a' }}>{studentToDelete.name}</strong> (<span style={{ color: '#2563eb' }}>{studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id}</span>) ra khỏi cơ sở dữ liệu không?
                </p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStudentToDelete(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                Hủy bỏ
              </button>
              
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteStudent}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background 0.2s'
                }}
              >
                {isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};