import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Home, Users, AlertTriangle, Crown, UserCheck, Filter, Lock, Unlock, UserX, AlertCircle, User, UserPlus, CheckCircle, UserPlus2, Save } from 'lucide-react';
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

  const [activeAddStudentRoom, setActiveAddStudentRoom] = useState<number | null>(null);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentMssv, setNewStudentMssv] = useState<string>('');
  const [newStudentGender, setNewStudentGender] = useState<'Nam' | 'Nữ'>('Nam');

  const [teacherList, setTeacherList] = useState<string[]>([]);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');

  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isAddingStudent, setIsAddingStudent] = useState<boolean>(false);
  const [isSavingRooms, setIsSavingRooms] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(false);

  // 1. Tải trạng thái khóa phòng từ bảng RoomConfig trên CSDL khi khởi tạo[cite: 6]
  useEffect(() => {
    const fetchRoomConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('RoomConfig')
          .select('isLocked')
          .eq('id', 1)
          .maybeSingle();

        if (!error && data) {
          setIsRoomLocked(!!data.isLocked);
        }
      } catch (err) {
        console.error('Lỗi tải trạng thái RoomConfig:', err);
      }
    };
    fetchRoomConfig();
  }, []);

  // 2. Lắng nghe thay đổi Realtime cho RoomConfig để đồng bộ giữa các máy[cite: 6]
  useEffect(() => {
    const channel = supabase
      .channel('room_allocation_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'RoomConfig' },
        (payload: any) => {
          if (payload.new && typeof payload.new.isLocked === 'boolean') {
            setIsRoomLocked(payload.new.isLocked);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  // Thuật toán chia phòng tự động (khi chưa khóa phòng)
  const calculateRoomAllocation = useCallback((): Room[] => {
    const allValidStudents = students.filter((s: any) => {
      if (s.isAbsent || s.Vang === 'x' || s.Nghi === 'x') return false;
      return true;
    });

    const sortWithinGender = (group: Student[]) => {
      const regular = group.filter((s: any) => !s.isLate && !s.DiTre);
      const late = group
        .filter((s: any) => s.isLate || s.DiTre)
        .sort((a: any, b: any) => {
          const rawA = a.late_at;
          const rawB = b.late_at;

          const timeA = rawA ? new Date(String(rawA).replace(' ', 'T')).getTime() : 0;
          const timeB = rawB ? new Date(String(rawB).replace(' ', 'T')).getTime() : 0;

          if (timeA !== timeB) return timeA - timeB;

          const nameA = String((a as any).HoVaTen || a.name || '');
          const nameB = String((b as any).HoVaTen || b.name || '');
          return nameA.localeCompare(nameB, 'vi', { sensitivity: 'accent' });
        });

      return [...regular, ...late];
    };

    const sortedFemales = sortWithinGender(allValidStudents.filter((s: any) => s.gender === 'Nữ' || s.GioiTinh === 'Nữ'));
    const sortedMales = sortWithinGender(allValidStudents.filter((s: any) => s.gender !== 'Nữ' && s.GioiTinh !== 'Nữ'));

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

        if ((student as any).isLate || (student as any).DiTre) {
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

  const confirmMarkAbsent = async () => {
    if (!studentToDelete || !canManage) return;

    setIsDeleting(true);
    const studentKey = String(studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id);

    try {
      const { error } = await supabase
        .from('DanhSachSinhVien')
        .update({ Vang: 'x', Nghi: 'x' })
        .eq('MSSV', studentKey);

      if (error) {
        showToast('Lỗi cập nhật CSDL: ' + error.message, 'error');
        setIsDeleting(false);
        return;
      }
    } catch (err) {
      showToast('Lỗi kết nối mạng.', 'error');
      setIsDeleting(false);
      return;
    }

    if (setStudents) {
      setStudents((prevStudents) =>
        prevStudents.map((s) => {
          const sKey = String(s.MSSV || (s as any).studentId || s.id);
          if (sKey === studentKey) {
            return { ...s, isAbsent: true, Vang: 'x', Nghi: 'x' };
          }
          return s;
        })
      );
    }

    setIsDeleting(false);
    setStudentToDelete(null);
    showToast(`Đã đánh dấu vắng cho sinh viên ${(studentToDelete as any).HoVaTen || studentToDelete.name}.`, 'success');
  };

  // 3. Lấy sơ đồ phòng đồng bộ trực tiếp từ cột Phong trong CSDL[cite: 6]
  const getRoomsToDisplay = useMemo(() => {
    const hasAnyDbRoomAssigned = students.some((s: any) => s.Phong && String(s.Phong).trim() !== '');

    if (isRoomLocked || hasAnyDbRoomAssigned) {
      let maxRm = INITIAL_ROOMS;
      students.forEach((s: any) => {
        const pNum = parseInt(s.Phong, 10);
        if (!isNaN(pNum) && pNum > maxRm) maxRm = pNum;
      });

      const dbRooms: Room[] = Array.from({ length: maxRm }, (_, i) => ({
        roomNumber: i + 1,
        students: [],
        genderType: 'Trống',
        hasPenalized: false,
      }));

      students.forEach((s: any) => {
        if (s.isAbsent || s.Vang === 'x' || s.Nghi === 'x') return;
        const pNum = parseInt(s.Phong, 10);
        if (!isNaN(pNum) && pNum >= 1 && pNum <= dbRooms.length) {
          dbRooms[pNum - 1].students.push(s);
          const g = String(s.gender || s.GioiTinh || '').trim();
          dbRooms[pNum - 1].genderType = g === 'Nữ' ? 'Nữ' : 'Nam';
          if (s.isLate || s.DiTre) dbRooms[pNum - 1].hasPenalized = true;
        }
      });

      if (dbRooms.some(r => r.students.length > 0)) {
        return dbRooms;
      }
    }

    return calculatedRooms;
  }, [isRoomLocked, calculatedRooms, students, INITIAL_ROOMS]);

  const rooms = getRoomsToDisplay;

  // 4. NÚT XÁC NHẬN PHÒNG (Ghi dữ liệu phòng vào CSDL bảng DanhSachSinhVien và bật isLocked)[cite: 6]
  const handleConfirmRoomAllocation = async () => {
    if (!canManage) return;
    setIsSavingRooms(true);

    try {
      let successCount = 0;

      for (const room of rooms) {
        for (const st of room.students) {
          const studentKey = String(st.MSSV || (st as any).studentId || st.id || '').trim();
          if (!studentKey) continue;

          const { error: updateError } = await supabase
            .from('DanhSachSinhVien')
            .update({ Phong: String(room.roomNumber) })
            .eq('MSSV', studentKey);

          if (!updateError) {
            successCount++;
          }
        }
      }

      const { error: configError } = await supabase
        .from('RoomConfig')
        .upsert({ id: 1, isLocked: true });

      if (configError) {
        console.error('Lỗi cập nhật RoomConfig:', configError.message);
      }

      setIsRoomLocked(true);

      if (onUpdateRoomData) {
        const assignments: { studentKey: string; roomNumber: number }[] = [];
        rooms.forEach((room) => {
          room.students.forEach((st: any) => {
            const studentKey = String(st.MSSV || st.studentId || st.id);
            assignments.push({ studentKey, roomNumber: room.roomNumber });
          });
        });
        onUpdateRoomData(assignments);
      }

      showToast(`Đã lưu thành công ${successCount} sinh viên và khóa sơ đồ phòng trên hệ thống!`, 'success');
    } catch (err: any) {
      console.error('Lỗi khi lưu xác nhận phòng:', err);
      showToast('Lỗi khi lưu phân phòng: ' + err.message, 'error');
    } finally {
      setIsSavingRooms(false);
    }
  };

  // 5. NÚT KHÓA / MỞ KHÓA PHÒNG (Đổi trạng thái isLocked trên CSDL)[cite: 6]
  const toggleLockRooms = async () => {
    if (!canManage) return;

    const targetLockState = !isRoomLocked;

    try {
      const { error: configError } = await supabase
        .from('RoomConfig')
        .upsert({ id: 1, isLocked: targetLockState });

      if (configError) {
        console.error('Lỗi thay đổi trạng thái khóa:', configError.message);
        showToast('Không thể thay đổi trạng thái khóa trên CSDL', 'error');
        return;
      }

      setIsRoomLocked(targetLockState);
      showToast(
        targetLockState
          ? 'Đã khóa cố định sơ đồ phòng.'
          : 'Đã mở khóa sơ đồ phòng.',
        'success'
      );

      if (targetLockState) {
        for (const room of rooms) {
          for (const st of room.students) {
            const studentKey = String(st.MSSV || (st as any).studentId || st.id);
            if (studentKey && studentKey !== 'undefined') {
              await supabase
                .from('DanhSachSinhVien')
                .update({ Phong: String(room.roomNumber) })
                .eq('MSSV', studentKey);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Lỗi kết nối:', err);
      showToast('Lỗi kết nối khi thay đổi trạng thái khóa', 'error');
    }
  };

  const handleAddNewStudentManual = async (roomNumber: number) => {
    if (!canManage) return;
    if (!newStudentName.trim() || !newStudentMssv.trim()) {
      showToast('Vui lòng nhập đầy đủ Họ tên và MSSV!', 'error');
      return;
    }

    setIsAddingStudent(true);
    const mssvClean = newStudentMssv.trim();
    const nameClean = newStudentName.trim();
    const genderClean = newStudentGender;

    const newStudentObj: Student = {
      id: mssvClean,
      MSSV: mssvClean,
      HoVaTen: nameClean,
      name: nameClean,
      gender: genderClean,
      GioiTinh: genderClean,
      Phong: String(roomNumber),
      phong: roomNumber,
      Vang: '',
      Nghi: '',
      isAbsent: false,
    } as any;

    try {
      const { data: existingData, error: checkError } = await supabase
        .from('DanhSachSinhVien')
        .select('MSSV')
        .eq('MSSV', mssvClean)
        .maybeSingle();

      if (checkError) {
        showToast('Lỗi kiểm tra CSDL: ' + checkError.message, 'error');
        setIsAddingStudent(false);
        return;
      }

      let error;
      if (existingData) {
        const res = await supabase
          .from('DanhSachSinhVien')
          .update({
            HoVaTen: nameClean,
            GioiTinh: genderClean,
            Phong: String(roomNumber),
            Vang: '',
            Nghi: ''
          })
          .eq('MSSV', mssvClean);
        error = res.error;
      } else {
        const res = await supabase
          .from('DanhSachSinhVien')
          .insert([
            {
              MSSV: mssvClean,
              HoVaTen: nameClean,
              GioiTinh: genderClean,
              Phong: String(roomNumber),
              Vang: '',
              Nghi: ''
            }
          ]);
        error = res.error;
      }

      if (error) {
        showToast('Lỗi lưu CSDL Supabase: ' + error.message, 'error');
        setIsAddingStudent(false);
        return;
      }
    } catch (err: any) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
      setIsAddingStudent(false);
      return;
    }

    if (setStudents) {
      setStudents((prev) => {
        const existingIndex = prev.findIndex((s: any) => String(s.MSSV || s.id) === mssvClean);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = { 
            ...updated[existingIndex], 
            HoVaTen: nameClean, 
            name: nameClean, 
            gender: genderClean, 
            GioiTinh: genderClean, 
            Phong: String(roomNumber),
            phong: roomNumber,
            isAbsent: false, 
            Vang: '',
            Nghi: ''
          } as any;
          return updated;
        } else {
          return [...prev, newStudentObj];
        }
      });
    }

    setNewStudentName('');
    setNewStudentMssv('');
    setActiveAddStudentRoom(null);
    setIsAddingStudent(false);
    showToast(`Đã lưu sinh viên ${nameClean} vào CSDL và Phòng ${roomNumber} thành công!`, 'success');
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
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = room.students.find((st: any) => st.TruongPhong === 'x' || st.truongPhong === 'x');
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

  const totalPenalized = useMemo(() => {
    return students.filter((s: any) => (s.isAbsent || s.Vang === 'x' || s.Nghi === 'x') || s.isLate || s.DiTre).length;
  }, [students]);

  const { totalFemale, totalMale } = useMemo(() => {
    let female = 0;
    let male = 0;
    rooms.forEach((room) => {
      room.students.forEach((st: any) => {
        const g = String(st.gender || st.GioiTinh || '').trim().toLowerCase();
        if (g === 'nữ' || g === 'nu' || g === 'female') {
          female++;
        } else {
          male++;
        }
      });
    });
    return { totalFemale: female, totalMale: male };
  }, [rooms]);

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
                🔒 Đã khóa sơ đồ phòng
              </span>
            )}
          </h2>
          <p>Phân phòng tự động đồng bộ trên hệ thống cơ sở dữ liệu.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {canManage && (
            <>
              <button
                type="button"
                disabled={isSavingRooms}
                onClick={handleConfirmRoomAllocation}
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
                <Save size={16} />
                {isSavingRooms ? 'Đang lưu...' : 'Xác Nhận Phòng'}
              </button>

              {!isRoomLocked ? (
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
                    border: '1px solid #2563eb',
                    background: '#eff6ff',
                    color: '#2563eb',
                  }}
                >
                  <Lock size={16} />
                  Khóa Cố Định Phòng
                </button>
              ) : (
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
                    border: '1px solid #dc2626',
                    background: '#fef2f2',
                    color: '#dc2626',
                  }}
                >
                  <Unlock size={16} />
                  Mở Khóa Phòng
                </button>
              )}
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
            const isFull = activeRoomStudents.length >= MAX_PER_ROOM;
            const isEmpty = activeRoomStudents.length === 0;
            const currentLeaderKey = leaders[room.roomNumber];
            const isDropdownOpen = activeDropdownRoom === room.roomNumber;
            const isAddStudentOpen = activeAddStudentRoom === room.roomNumber;

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

                    {canManage && !isFull && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveAddStudentRoom(isAddStudentOpen ? null : room.roomNumber);
                          setNewStudentName('');
                          setNewStudentMssv('');
                          setNewStudentGender(room.genderType === 'Nữ' ? 'Nữ' : 'Nam');
                        }}
                        title="Thêm sinh viên mới vào phòng này"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          border: '1px solid #3b82f6',
                          background: '#eff6ff',
                          color: '#2563eb',
                          padding: '3px 6px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <UserPlus2 size={13} />
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

                {isAddStudentOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '42px',
                      right: '12px',
                      zIndex: 25,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                      padding: '12px',
                      width: '240px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>THÊM VÀO PHÒNG {room.roomNumber}</span>
                      <button 
                        type="button"
                        onClick={() => setActiveAddStudentRoom(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>Họ và tên:</label>
                        <input 
                          type="text"
                          placeholder="Nhập họ và tên..."
                          value={newStudentName}
                          onChange={(e) => setNewStudentName(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>MSSV:</label>
                        <input 
                          type="text"
                          placeholder="Nhập MSSV..."
                          value={newStudentMssv}
                          onChange={(e) => setNewStudentMssv(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '2px' }}>Giới tính:</label>
                        <select
                          value={newStudentGender}
                          onChange={(e) => setNewStudentGender(e.target.value as 'Nam' | 'Nữ')}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none', background: '#fff' }}
                        >
                          <option value="Nam">Nam</option>
                          <option value="Nữ">Nữ</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={isAddingStudent}
                        onClick={() => handleAddNewStudentManual(room.roomNumber)}
                        style={{
                          marginTop: '4px',
                          width: '100%',
                          padding: '6px',
                          background: '#2563eb',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {isAddingStudent ? 'Đang thêm...' : 'Lưu vào phòng'}
                      </button>
                    </div>
                  </div>
                )}

                {isDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '42px',
                      right: '12px',
                      zIndex: 30,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                      padding: '8px',
                      width: '220px',
                      maxHeight: '260px',
                      overflowY: 'auto'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', padding: '4px 8px', marginBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                      CHỌN TRƯỞNG PHÒNG {room.roomNumber}
                    </div>
                    
                    {currentLeaderKey && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLeader(room.roomNumber)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <UserX size={14} />
                        <span>Hủy chức vụ trưởng phòng</span>
                      </button>
                    )}

                    {activeRoomStudents.length === 0 ? (
                      <div style={{ padding: '8px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>Phòng chưa có sinh viên</div>
                    ) : (
                      activeRoomStudents.map((st: any) => {
                        const stKey = String(st.MSSV || st.studentId || st.id);
                        const stName = st.HoVaTen || st.name || 'Không tên';
                        const isLeader = currentLeaderKey === stKey;

                        return (
                          <button
                            key={stKey}
                            type="button"
                            onClick={() => handleSelectLeader(room.roomNumber, stKey)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '6px 8px',
                              background: isLeader ? '#fef9c3' : 'transparent',
                              color: isLeader ? '#854d0e' : '#1e293b',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: isLeader ? 700 : 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '2px'
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stName}</span>
                            {isLeader && <Crown size={14} color="#eab308" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                <div className="room-card-body">
                  {isEmpty ? (
                    <div className="empty-room-text">Phòng trống</div>
                  ) : (
                    <ul className="student-list">
                      {activeRoomStudents.map((st: any, idx: number) => {
                        const stKey = String(st.MSSV || st.studentId || st.id);
                        const isLeader = currentLeaderKey === stKey;
                        const isLateOrPenalized = st.isLate || st.DiTre;
                        const studentName = st.HoVaTen || st.name || '---';
                        const studentMssv = st.MSSV || st.studentId || st.id || '---';

                        return (
                          <li 
                            key={stKey || idx} 
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderRadius: '4px', marginBottom: '2px', background: isLeader ? '#fefce8' : 'transparent' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <span style={{ fontSize: '11px', color: '#64748b', minWidth: '16px' }}>{idx + 1}.</span>
                              {isLeader && <Crown size={13} color="#eab308" />}
                              <span style={{ fontSize: '12px', fontWeight: isLeader ? 600 : 400, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {studentName} <span style={{ color: '#64748b', fontSize: '11px' }}>({studentMssv})</span>
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              {isLateOrPenalized && (
                                <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>
                                  Trễ
                                </span>
                              )}

                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => setStudentToDelete(st)}
                                  title="Đánh dấu vắng"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                                >
                                  <UserX size={13} />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="room-card-footer">
                  <span>Sĩ số: <strong>{activeRoomStudents.length}</strong>/{MAX_PER_ROOM}</span>
                  {currentLeaderKey && (
                    <span style={{ color: '#854d0e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <Crown size={12} color="#eab308" /> Có TP
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {studentToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}>
          <div style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle color="#dc2626" size={20} />
              Xác nhận vắng sinh viên
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
              Bạn có chắc chắn muốn đánh dấu vắng cho sinh viên <strong>{(studentToDelete as any).HoVaTen || studentToDelete.name}</strong> (MSSV: {studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id})? Sinh viên này sẽ bị loại khỏi sơ đồ phòng hiện tại.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStudentToDelete(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmMarkAbsent}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
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