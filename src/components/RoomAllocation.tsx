import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Home, Users, AlertTriangle, Crown, UserCheck, Filter, Lock, Unlock, UserX, AlertCircle, User, UserPlus, CheckCircle, Plus } from 'lucide-react';
import type { Student } from '../types/student';
import type { User as AuthUser } from '../types/auth';
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
  currentUser?: (AuthUser & { can_manage?: boolean }) | null;
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

  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSavingRooms, setIsSavingRooms] = useState<boolean>(false);

  // Trạng thái modal thêm sinh viên theo phòng cụ thể (bao gồm trường Lop)
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [targetRoomForAdd, setTargetRoomForAdd] = useState<number | null>(null);
  const [newStudentForm, setNewStudentForm] = useState({
    HoVaTen: '',
    MSSV: '',
    Lop: '',
    GioiTinh: 'Nam' as 'Nam' | 'Nữ',
    ThayCo: ''
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);

  // Trạng thái thông báo / Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

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

  // Lắng nghe thay đổi dữ liệu thời gian thực từ Supabase để đồng bộ giữa các thiết bị
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'DanhSachSinhVien' },
        async () => {
          if (setStudents) {
            const { data, error } = await supabase.from('DanhSachSinhVien').select('*');
            if (!error && data) {
              setStudents(data as unknown as Student[]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'RoomConfig' },
        async () => {
          const { data, error } = await supabase.from('RoomConfig').select('*').single();
          if (!error && data) {
            setIsRoomLocked(data.isLocked);
            localStorage.setItem('KTX_IS_ROOM_LOCKED', String(data.isLocked));
            if (!data.isLocked) {
              setLockedRoomsData(null);
              localStorage.removeItem('KTX_LOCKED_ROOMS_DATA');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setStudents]);

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
          if (uniqueNames.length > 0) {
            setNewStudentForm(prev => ({ ...prev, ThayCo: uniqueNames[0] }));
          }
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
      if (s.isAbsent || s.Vang === 'x') return false;
      return true;
    });

    const sortWithinGender = (group: Student[]) => {
      return group.sort((a, b) => {
        const nameA = String((a as any).HoVaTen || a.name || '');
        const nameB = String((b as any).HoVaTen || b.name || '');
        return nameA.localeCompare(nameB, 'vi', { sensitivity: 'accent' });
      });
    };

    const sortedFemales = sortWithinGender(allValidStudents.filter((s: any) => s.GioiTinh === 'Nữ'));
    const sortedMales = sortWithinGender(allValidStudents.filter((s: any) => s.GioiTinh !== 'Nữ'));

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
          if (!freshStudent || freshStudent.isAbsent || freshStudent.Vang === 'x') {
            return null;
          }
          return freshStudent;
        })
        .filter(Boolean) as Student[]
    }));
  }, [isRoomLocked, lockedRoomsData, calculatedRooms, students]);

  const rooms = getRoomsToDisplay;

  const handleConfirmAndSaveRooms = async () => {
    if (!canManage) return;
    setIsSavingRooms(true);

    try {
      for (const room of rooms) {
        for (const st of room.students) {
          const mssvValue = st.MSSV || (st as any).studentId || st.id;
          if (mssvValue) {
            const { error } = await supabase
              .from('DanhSachSinhVien')
              .update({ Phong: room.roomNumber })
              .eq('MSSV', mssvValue);

            if (error) {
              console.error(`Lỗi cập nhật phòng cho MSSV ${mssvValue}:`, error.message);
            }
          }
        }
      }

      showToast('Đã xác nhận và lưu sơ đồ phòng lên hệ thống thành công!', 'success');
    } catch (err: any) {
      console.error('Lỗi kết nối khi lưu phòng:', err);
      showToast('Lỗi khi lưu phòng: ' + (err.message || err), 'error');
    } finally {
      setIsSavingRooms(false);
    }
  };

  const openAddStudentModalForRoom = (roomNum: number, roomGender: 'Nữ' | 'Nam' | 'Trống') => {
    setTargetRoomForAdd(roomNum);
    setNewStudentForm(prev => ({
      ...prev,
      GioiTinh: roomGender === 'Nữ' ? 'Nữ' : 'Nam'
    }));
    setIsAddStudentOpen(true);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || targetRoomForAdd === null) return;

    if (!newStudentForm.HoVaTen.trim() || !newStudentForm.MSSV.trim()) {
      showToast('Vui lòng nhập đầy đủ Họ và tên và MSSV!', 'error');
      return;
    }

    setIsSubmittingAdd(true);

    try {
      const studentDataToInsert = {
        MSSV: newStudentForm.MSSV.trim(),
        HoVaTen: newStudentForm.HoVaTen.trim(),
        Lop: newStudentForm.Lop.trim(),
        GioiTinh: newStudentForm.GioiTinh,
        ThayCo: newStudentForm.ThayCo || selectedTeacherFilter || teacherList[0] || '',
        Phong: targetRoomForAdd,
        Vang: null
      };

      const { error } = await supabase
        .from('DanhSachSinhVien')
        .insert([studentDataToInsert]);

      if (error) {
        console.error('Lỗi khi thêm sinh viên vào Supabase:', error.message);
        showToast('Lỗi khi thêm sinh viên: ' + error.message, 'error');
        setIsSubmittingAdd(false);
        return;
      }

      if (setStudents) {
        setStudents((prev) => [...prev, studentDataToInsert as unknown as Student]);
      }

      if (isRoomLocked && lockedRoomsData) {
        const updatedLockedRooms = lockedRoomsData.map(room => {
          if (room.roomNumber === targetRoomForAdd) {
            return {
              ...room,
              genderType: room.genderType === 'Trống' ? newStudentForm.GioiTinh : room.genderType,
              students: [...room.students, studentDataToInsert as unknown as Student]
            };
          }
          return room;
        });
        setLockedRoomsData(updatedLockedRooms);
        localStorage.setItem('KTX_LOCKED_ROOMS_DATA', JSON.stringify(updatedLockedRooms));
      }

      showToast(`Đã thêm sinh viên ${newStudentForm.HoVaTen} vào Phòng ${targetRoomForAdd} thành công!`, 'success');
      
      setIsAddStudentOpen(false);
      setTargetRoomForAdd(null);
      setNewStudentForm({
        HoVaTen: '',
        MSSV: '',
        Lop: '',
        GioiTinh: 'Nam',
        ThayCo: teacherList[0] || ''
      });
    } catch (err: any) {
      console.error('Lỗi kết nối khi thêm sinh viên:', err);
      showToast('Lỗi hệ thống khi thêm sinh viên.', 'error');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const confirmMarkAbsent = async () => {
    if (!studentToDelete || !canManage) return;

    setIsDeleting(true);
    const studentKey = String(studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id);

    try {
      const mssvValue = studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id;

      const { error } = await supabase
        .from('DanhSachSinhVien')
        .update({ Vang: 'x' })
        .eq('MSSV', mssvValue);

      if (error) {
        console.error('Lỗi cập nhật vắng trong Supabase:', error.message);
        showToast('Lỗi cập nhật CSDL: ' + error.message, 'error');
        setIsDeleting(false);
        return;
      }
    } catch (err) {
      console.error('Lỗi kết nối:', err);
      showToast('Lỗi kết nối mạng.', 'error');
      setIsDeleting(false);
      return;
    }

    if (setStudents) {
      setStudents((prevStudents) =>
        prevStudents.map((s) => {
          const sKey = String(s.MSSV || (s as any).studentId || s.id);
          if (sKey === studentKey) {
            return { ...s, isAbsent: true, Vang: 'x' };
          }
          return s;
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
    showToast(`Đã đánh dấu vắng cho sinh viên ${(studentToDelete as any).HoVaTen || studentToDelete.name}.`, 'success');
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
        showToast('Đã khóa cố định sơ đồ phòng thành công.', 'success');
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
        showToast('Đã mở khóa sơ đồ phòng.', 'success');
      } catch (err) {
        console.error('Lỗi kết nối:', err);
      }
    }
  };

  const filteredRooms = useMemo(() => {
    return rooms.map((room) => {
      if (!selectedTeacherFilter) return room;
      const matchedStudents = room.students.filter((st: any) => {
        const studentTeacher = st.ThayCo || st.thayCo || st.HoTen || st.hoTen;
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
    showToast(`Đã chỉ định trưởng phòng cho Phòng ${roomNumber}.`, 'success');
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
    showToast(`Đã hủy chức vụ trưởng phòng của Phòng ${roomNumber}.`, 'success');
  };

  const totalActiveAllocated = useMemo(() => {
    return rooms.reduce((acc, r) => acc + r.students.length, 0);
  }, [rooms]);

  const totalAbsent = useMemo(() => {
    return students.filter((s: any) => (s.isAbsent || s.Vang === 'x')).length;
  }, [students]);

  const { totalFemale, totalMale } = useMemo(() => {
    const validStudents = students.filter((s: any) => !s.isAbsent && s.Vang !== 'x');
    const femaleCount = validStudents.filter((s: any) => s.GioiTinh === 'Nữ').length;
    const maleCount = validStudents.filter((s: any) => s.GioiTinh !== 'Nữ').length;
    return { totalFemale: femaleCount, totalMale: maleCount };
  }, [students]);

  return (
    <div className="room-container" style={{ position: 'relative' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: toastMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${toastMessage.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: toastMessage.type === 'success' ? '#166534' : '#991b1b',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage.type === 'success' ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#dc2626" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

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
              ? 'Phòng đã được khóa cố định. Bấm nút dấu cộng (+) trên mỗi phòng dưới 12 người để thêm sinh viên mới.'
              : 'Đang ở chế độ tự động phân phòng.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {canManage && (
            <>
              <button
                type="button"
                onClick={handleConfirmAndSaveRooms}
                disabled={isSavingRooms}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  border: '1px solid #16a34a',
                  background: '#f0fdf4',
                  color: '#16a34a',
                }}
              >
                <CheckCircle size={16} />
                {isSavingRooms ? 'Đang lưu...' : 'Xác Nhận Phòng'}
              </button>

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
            </>
          )}

          <div className="room-stats">
            <div className="stat-card">
              <Users size={18} color="#2563eb" />
              <span>Đang ở: <strong>{totalActiveAllocated}</strong> SV</span>
            </div>
            <div className="stat-card" style={{ background: '#fdf2f8', borderColor: '#fbcfe8', color: '#db2777' }}>
              <User size={18} color="#db2777" />
              <span>Tổng Nữ: <strong>{totalFemale}</strong></span>
            </div>
            <div className="stat-card" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#2563eb' }}>
              <UserPlus size={18} color="#2563eb" />
              <span>Tổng Nam: <strong>{totalMale}</strong></span>
            </div>
            <div className="stat-card warning">
              <AlertTriangle size={18} color="#dc2626" />
              <span>Vắng: <strong>{totalAbsent}</strong> SV</span>
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
            const isFull = activeRoomStudents.length >= MAX_PER_ROOM;
            const isEmpty = activeRoomStudents.length === 0;
            const currentLeaderKey = leaders[room.roomNumber];
            const isDropdownOpen = activeDropdownRoom === room.roomNumber;

            return (
              <div
                key={room.roomNumber}
                className={`room-card ${isEmpty ? 'empty' : ''}`}
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

                    {canManage && !isFull && (
                      <button
                        type="button"
                        onClick={() => openAddStudentModalForRoom(room.roomNumber, room.genderType)}
                        title={`Thêm sinh viên vào Phòng ${room.roomNumber}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          border: '1px solid #2563eb',
                          background: '#eff6ff',
                          color: '#2563eb',
                          padding: '3px 7px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={13} />
                        <span>Thêm</span>
                      </button>
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
                      const studentName = st.HoVaTen || st.name;

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
                            {idx + 1}. {studentName}
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
                    {isFull ? 'Đã Đầy (12/12)' : isEmpty ? 'Trống' : 'Còn Chỗ'}
                  </span>
                </div>

                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${(activeRoomStudents.length / MAX_PER_ROOM) * 100}%`,
                      backgroundColor: room.genderType === 'Nữ' ? '#ec4899' : '#3b82f6',
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
                      const studentName = st.HoVaTen || st.name;
                      const studentClass = st.Lop || st.lop;
                      const studentTeacher = st.ThayCo || st.thayCo || st.HoTen || st.hoTen;
                      const isTeacherMatch = selectedTeacherFilter ? studentTeacher === selectedTeacherFilter : true;

                      return (
                        <div
                          key={studentKey + '-' + idx}
                          className="student-item"
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
                              {idx + 1}. {studentName} ({displayCode}){studentClass ? ` - Lớp: ${studentClass}` : ''}
                            </span>
                            {studentTeacher && <span style={{ fontSize: '10px', color: '#64748b' }}>GV: {studentTeacher}</span>}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {canManage && isRoomLocked && (
                              <button
                                type="button"
                                onClick={() => setStudentToDelete(st)}
                                title="Đánh dấu vắng và ẩn khỏi sơ đồ phòng"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  background: '#fef2f2',
                                  border: '1px solid #f87171',
                                  color: '#dc2626',
                                  padding: '2px 6px',
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

      {isAddStudentOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="#2563eb" />
                Thêm Sinh Viên vào Phòng {targetRoomForAdd}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddStudentOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Họ và tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={newStudentForm.HoVaTen}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, HoVaTen: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Mã số sinh viên (MSSV) *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 25000123"
                  value={newStudentForm.MSSV}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, MSSV: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Lớp</label>
                <input
                  type="text"
                  placeholder="Ví dụ: CĐTT25A"
                  value={newStudentForm.Lop}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, Lop: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Giới tính (GioiTinh)</label>
                  <select
                    value={newStudentForm.GioiTinh}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, GioiTinh: e.target.value as 'Nam' | 'Nữ' })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', outline: 'none' }}
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Giáo viên phụ trách</label>
                  <select
                    value={newStudentForm.ThayCo}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, ThayCo: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', outline: 'none' }}
                  >
                    {teacherList.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  disabled={isSubmittingAdd}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #2563eb', background: '#2563eb', color: '#ffffff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isSubmittingAdd ? 'Đang thêm...' : 'Lưu sinh viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                background: '#fef2f2',
                padding: '10px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626'
              }}>
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>Xác nhận vắng học</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Hành động này sẽ cập nhật trạng thái vắng</p>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: '#334155', marginBottom: '20px', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn đánh dấu sinh viên <strong>{(studentToDelete as any).HoVaTen || studentToDelete.name}</strong> ({studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id}) là vắng mặt và ẩn khỏi sơ đồ phòng không?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmMarkAbsent}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #dc2626',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isDeleting ? 'Đang xử lý...' : 'Xác nhận vắng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};