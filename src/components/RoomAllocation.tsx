import React, { useState, useEffect, useMemo } from 'react';
import { Home, Users, AlertTriangle, ShieldCheck, Crown, UserCheck, Filter } from 'lucide-react';
import type { Student } from '../types/student';
import type { User } from '../types/auth';
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
  onSetRoomLeader,
  onUpdateRoomData,
  currentUser,
}) => {
  const MAX_PER_ROOM = 12;
  const INITIAL_ROOMS = 20;

  const [activeDropdownRoom, setActiveDropdownRoom] = useState<number | null>(null);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');

  const teacherList = ['Lâm Văn Vũ', 'Cao Trần Trí', 'Trần Thị Hồng Huệ', 'Nguyễn Thành Tín'];

  const canManage = currentUser 
    ? (currentUser.role === 'admin' || currentUser.can_manage === true) 
    : true;

  // --- THUẬT TOÁN SẮP XẾP PHÒNG (Tối ưu bằng useMemo) ---
  const rooms = useMemo(() => {
    const activeStudents = students.filter((s) => !s.isAbsent);

    const sortWithinGender = (group: Student[]) => {
      const regular = group.filter((s) => !s.isLate);
      const late = group
        .filter((s) => s.isLate)
        .sort((a, b) => {
          const timeA = a.late_at ? new Date(a.late_at).getTime() : 0;
          const timeB = b.late_at ? new Date(b.late_at).getTime() : 0;

          // 1. Nếu thời gian trễ khác nhau, sắp xếp theo thời gian tăng dần
          if (timeA !== timeB) {
            return timeA - timeB;
          }

          // 2. Nếu thời gian trễ bằng nhau, sắp xếp theo MSSV tăng dần để tránh dồn ứ bất thường
          const idA = String(a.studentId || a.id || '');
          const idB = String(b.studentId || b.id || '');
          return idA.localeCompare(idB);
        });
      return [...regular, ...late];
    };

    const sortedFemales = sortWithinGender(activeStudents.filter((s) => s.gender === 'Nữ'));
    const sortedMales = sortWithinGender(activeStudents.filter((s) => s.gender !== 'Nữ'));

    let totalRoomsNeeded = Math.ceil(activeStudents.length / MAX_PER_ROOM);
    if (totalRoomsNeeded < INITIAL_ROOMS) {
      totalRoomsNeeded = INITIAL_ROOMS;
    }

    const generatedRooms: Room[] = Array.from({ length: totalRoomsNeeded }, (_, i) => ({
      roomNumber: i + 1,
      students: [],
      genderType: 'Trống',
      hasPenalized: false,
    }));

    let currentRoomIdx = 0;

    const fillGroupToRooms = (group: Student[], gender: 'Nữ' | 'Nam') => {
      if (group.length === 0) return;

      if (
        generatedRooms[currentRoomIdx].students.length > 0 &&
        (generatedRooms[currentRoomIdx].genderType !== gender ||
          generatedRooms[currentRoomIdx].students.length >= MAX_PER_ROOM)
      ) {
        currentRoomIdx++;
      }

      for (const student of group) {
        if (currentRoomIdx >= generatedRooms.length) {
          generatedRooms.push({
            roomNumber: generatedRooms.length + 1,
            students: [],
            genderType: 'Trống',
            hasPenalized: false,
          });
        }

        if (generatedRooms[currentRoomIdx].students.length >= MAX_PER_ROOM) {
          currentRoomIdx++;
          if (currentRoomIdx >= generatedRooms.length) {
            generatedRooms.push({
              roomNumber: generatedRooms.length + 1,
              students: [],
              genderType: 'Trống',
              hasPenalized: false,
            });
          }
        }

        generatedRooms[currentRoomIdx].students.push(student);
        generatedRooms[currentRoomIdx].genderType = gender;
        
        if (student.isLate) {
          generatedRooms[currentRoomIdx].hasPenalized = true;
        }
      }

      if (generatedRooms[currentRoomIdx].students.length > 0) {
        currentRoomIdx++;
      }
    };

    fillGroupToRooms(sortedFemales, 'Nữ');
    fillGroupToRooms(sortedMales, 'Nam');

    return generatedRooms;
  }, [students]);

  // --- QUẢN LÝ TRƯỞNG PHÒNG TRỰC TIẾP TỪ DỮ LIỆU STUDENTS ---
  const leaders = useMemo(() => {
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = room.students.find((st) => st.truongPhong === 'x');
      if (leaderStudent) {
        const studentKey = String(leaderStudent.studentId || leaderStudent.id);
        loadedLeaders[room.roomNumber] = studentKey;
      }
    });
    return loadedLeaders;
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return rooms.map((room) => {
      if (!selectedTeacherFilter) return room;
      const matchedStudents = room.students.filter((st) => st.thayCo === selectedTeacherFilter);
      return {
        ...room,
        matchedStudents,
        hasMatch: matchedStudents.length > 0
      };
    }).filter((room) => !selectedTeacherFilter || room.hasMatch);
  }, [rooms, selectedTeacherFilter]);

  useEffect(() => {
    if (!onUpdateRoomData) return;

    const assignments: { studentKey: string; roomNumber: number }[] = [];
    rooms.forEach((room) => {
      room.students.forEach((st) => {
        const studentKey = String(st.studentId || st.id);
        assignments.push({ studentKey, roomNumber: room.roomNumber });
      });
    });

    onUpdateRoomData(assignments);
  }, [rooms, onUpdateRoomData]);

  const handleSelectLeader = (roomNumber: number, studentKey: string) => {
    if (!canManage) return;
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st) =>
      String(st.studentId || st.id)
    );

    if (onSetRoomLeader) {
      onSetRoomLeader(studentKey, roomStudentKeys);
    }
  };

  const handleRemoveLeader = (roomNumber: number) => {
    if (!canManage) return;
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st) =>
      String(st.studentId || st.id)
    );

    if (onSetRoomLeader) {
      onSetRoomLeader(null, roomStudentKeys);
    }
  };

  const totalAllocated = rooms.reduce((acc, r) => acc + r.students.length, 0);
  const totalPenalized = students.filter((s) => s.isAbsent || s.isLate).length;

  return (
    <div className="room-container">
      {/* PHẦN HEADER & THỐNG KÊ */}
      <div className="room-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Sơ Đồ Phòng KTX QPAN ({filteredRooms.length}/{rooms.length} Phòng)
          </h2>
          <p>Mỗi phòng tối đa 12 SV • Sắp xếp tuần tự theo giới tính • Tự động mở rộng phòng khi vượt sĩ số</p>
        </div>

        <div className="room-stats">
          <div className="stat-card">
            <Users size={18} color="#2563eb" />
            <span>Đã xếp: <strong>{totalAllocated}/{students.filter(s => !s.isAbsent).length}</strong> SV</span>
          </div>
          <div className="stat-card warning">
            <AlertTriangle size={18} color="#dc2626" />
            <span>Vi phạm/Trễ: <strong>{totalPenalized}</strong> SV</span>
          </div>
        </div>
      </div>

      {/* PHẦN BỘ LỌC GIÁO VIÊN */}
      <div style={{
        background: '#f8fafc', padding: '12px 18px', borderRadius: '8px',
        border: '1px solid #cbd5e1', marginBottom: '20px', display: 'flex',
        alignItems: 'center', gap: '12px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155', fontWeight: 600, fontSize: '14px' }}>
          <Filter size={18} color="#2563eb" />
          <span>Lọc theo Thầy/Cô phụ trách:</span>
        </div>

        <select
          value={selectedTeacherFilter}
          onChange={(e) => setSelectedTeacherFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '6px', border: '1px solid #94a3b8',
            outline: 'none', fontSize: '14px', background: '#ffffff', minWidth: '240px',
            cursor: 'pointer', color: '#1e293b', fontWeight: 500
          }}
        >
          <option value="">-- Tất cả Thầy/Cô (Hiện toàn bộ phòng) --</option>
          {teacherList.map((teacher) => (
            <option key={teacher} value={teacher}>{teacher}</option>
          ))}
        </select>

        {selectedTeacherFilter && (
          <button
            type="button"
            onClick={() => setSelectedTeacherFilter('')}
            style={{
              padding: '8px 12px', borderRadius: '6px', border: '1px solid #ef4444',
              background: '#fef2f2', color: '#dc2626', fontSize: '13px',
              fontWeight: 600, cursor: 'pointer'
            }}
          >
            ✕ Bỏ lọc
          </button>
        )}
      </div>

      {/* DANH SÁCH PHÒNG */}
      <div className="rooms-grid">
        {filteredRooms.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            Không tìm thấy phòng nào có sinh viên do Thầy/Cô <strong>{selectedTeacherFilter}</strong> phụ trách.
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isFull = room.students.length === MAX_PER_ROOM;
            const isEmpty = room.students.length === 0;
            const currentLeaderKey = leaders[room.roomNumber];
            const isDropdownOpen = activeDropdownRoom === room.roomNumber;
            const currentLeaderStudent = room.students.find(
              (st) => String(st.studentId || st.id) === currentLeaderKey
            );

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
                        onClick={() => setActiveDropdownRoom(isDropdownOpen ? null : room.roomNumber)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          border: '1px solid #cbd5e1', background: currentLeaderKey ? '#fef9c3' : '#ffffff',
                          color: currentLeaderKey ? '#854d0e' : '#475569', padding: '3px 8px',
                          borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {currentLeaderKey ? (
                          <>
                            <Crown size={13} color="#eab308" />
                            <span>TP: {currentLeaderStudent?.name || 'Đã chọn'}</span>
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

                {/* DROPDOWN CHỌN TRƯỞNG PHÒNG */}
                {isDropdownOpen && !isEmpty && canManage && (
                  <div style={{
                    position: 'absolute', top: '42px', right: '12px', zIndex: 20,
                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '6px', minWidth: '200px',
                    maxHeight: '220px', overflowY: 'auto',
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', padding: '4px 8px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px' }}>
                      CHỌN TRƯỞNG PHÒNG
                    </div>

                    {currentLeaderKey && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLeader(room.roomNumber)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: '12px',
                          color: '#dc2626', background: '#fef2f2', border: 'none', borderRadius: '4px',
                          cursor: 'pointer', marginBottom: '4px', fontWeight: 600,
                        }}
                      >
                        ✕ Hủy vị trí Trưởng phòng
                      </button>
                    )}

                    {room.students.map((st, idx) => {
                      const studentKey = String(st.studentId || st.id);
                      const isSelected = currentLeaderKey === studentKey;

                      return (
                        <button
                          key={studentKey + '-' + idx}
                          type="button"
                          onClick={() => handleSelectLeader(room.roomNumber, studentKey)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: '12px',
                            border: 'none', borderRadius: '4px', cursor: 'pointer',
                            background: isSelected ? '#fefce8' : 'transparent',
                            color: isSelected ? '#854d0e' : '#334155',
                            fontWeight: isSelected ? 700 : 500,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <span>{idx + 1}. {st.name}</span>
                          {isSelected && <Crown size={12} color="#eab308" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="room-capacity">
                  <span>Sức chứa: <strong>{room.students.length}/{MAX_PER_ROOM}</strong></span>
                  <span className={`status-pill ${isFull ? 'full' : isEmpty ? 'free' : 'available'}`}>
                    {isFull ? 'Đã Đầy' : isEmpty ? 'Trống' : 'Còn Chỗ'}
                  </span>
                </div>

                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(room.students.length / MAX_PER_ROOM) * 100}%`,
                      backgroundColor: room.hasPenalized ? '#ef4444' : room.genderType === 'Nữ' ? '#ec4899' : '#3b82f6',
                    }}
                  />
                </div>

                {/* DANH SÁCH SINH VIÊN TRONG PHÒNG */}
                <div className="room-student-list">
                  {isEmpty ? (
                    <div className="empty-text">Phòng trống</div>
                  ) : (
                    room.students.map((st, idx) => {
                      const studentKey = String(st.studentId || st.id);
                      const isLeader = currentLeaderKey === studentKey;
                      const isPenalized = st.isLate;
                      const isTeacherMatch = selectedTeacherFilter ? st.thayCo === selectedTeacherFilter : true;

                      return (
                        <div
                          key={studentKey + '-' + idx}
                          className={`student-item ${isPenalized ? 'bad-student' : ''}`}
                          style={{
                            backgroundColor: isLeader ? '#fefce8' : (selectedTeacherFilter && isTeacherMatch ? '#eff6ff' : undefined),
                            borderColor: isLeader ? '#fde047' : (selectedTeacherFilter && isTeacherMatch ? '#bfdbfe' : undefined),
                            opacity: selectedTeacherFilter && !isTeacherMatch ? 0.4 : 1,
                          }}
                        >
                          <span
                            className="st-name"
                            style={{
                              color: isLeader ? '#854d0e' : (isTeacherMatch && selectedTeacherFilter ? '#1e40af' : undefined),
                              fontWeight: isLeader || (isTeacherMatch && selectedTeacherFilter) ? 700 : undefined,
                            }}
                          >
                            {isLeader && (
                              <Crown size={14} color="#eab308" style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            )}
                            {idx + 1}. {st.name} ({st.studentId || st.id})
                            {st.thayCo && <span style={{ fontSize: '10px', display: 'block', color: '#64748b' }}>GV: {st.thayCo}</span>}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {st.isLate && <span className="tag-bad late">Trễ</span>}
                            {!isPenalized && !isLeader && <ShieldCheck size={14} color="#16a34a" />}
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
    </div>
  );
};