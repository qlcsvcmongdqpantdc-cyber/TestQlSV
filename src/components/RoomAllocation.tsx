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
  students = [],
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

  // Trạng thái modal chọn sinh viên vắng để đưa vào phòng
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [targetRoomForAdd, setTargetRoomForAdd] = useState<number | null>(null);
  const [targetRoomGender, setTargetRoomGender] = useState<'Nam' | 'Nữ' | 'Trống'>('Nam');
  const [selectedAbsentStudentId, setSelectedAbsentStudentId] = useState<string>('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(false);
  const [lockedRoomsData, setLockedRoomsData] = useState<Room[] | null>(null);

  // Hàm tính toán phân phòng mặc định (chỉ dùng khi chưa khóa phòng)
  const calculateRoomAllocation = useCallback((): Room[] => {
    const safeStudents = Array.isArray(students) ? students : [];
    const allValidStudents = safeStudents.filter((s: any) => {
      if (!s) return false;
      if (s.isAbsent || s.Vang === 'x') return false;
      return true;
    });

    const normalizeGender = (val: any) => {
      if (!val) return '';
      return String(val).trim().toLowerCase();
    };

    const sortByName = (group: Student[]) => {
      return group.sort((a, b) => {
        const nameA = String((a as any)?.HoVaTen || (a as any)?.name || '');
        const nameB = String((b as any)?.HoVaTen || (b as any)?.name || '');
        return nameA.localeCompare(nameB, 'vi', { sensitivity: 'accent' });
      });
    };

    const allFemales = allValidStudents.filter((s: any) => {
      const g = normalizeGender(s?.GioiTinh || s?.gender);
      return g === 'nữ' || g === 'nu';
    });

    const allMales = allValidStudents.filter((s: any) => {
      const g = normalizeGender(s?.GioiTinh || s?.gender);
      return g === 'nam';
    });

    const groupAndSortByTeacher = (group: Student[]) => {
      const teacherMap: Record<string, Student[]> = {};
      
      group.forEach((s: any) => {
        const teacher = String(s?.ThayCo || s?.thayCo || s?.HoTen || s?.hoTen || 'Chưa phân công').trim();
        if (!teacherMap[teacher]) {
          teacherMap[teacher] = [];
        }
        teacherMap[teacher].push(s);
      });

      const sortedTeachers = Object.keys(teacherMap).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'accent' }));
      
      let orderedList: Student[] = [];
      sortedTeachers.forEach(teacher => {
        const sortedStudentsOfTeacher = sortByName(teacherMap[teacher]);
        orderedList = orderedList.concat(sortedStudentsOfTeacher);
      });

      return orderedList;
    };

    const processedFemales = groupAndSortByTeacher(allFemales);
    const processedMales = groupAndSortByTeacher(allMales);

    const rooms: Room[] = [];
    let currentRoomNumber = 1;

    const fillToRooms = (group: Student[], gender: 'Nữ' | 'Nam') => {
      if (group.length === 0) return;
      let index = 0;
      while (index < group.length) {
        const chunk = group.slice(index, index + MAX_PER_ROOM);
        rooms.push({
          roomNumber: currentRoomNumber++,
          students: chunk,
          genderType: gender,
          hasPenalized: false,
        });
        index += MAX_PER_ROOM;
      }
    };

    fillToRooms(processedFemales, 'Nữ');
    fillToRooms(processedMales, 'Nam');

    if (rooms.length < INITIAL_ROOMS) {
      const needed = INITIAL_ROOMS - rooms.length;
      for (let i = 0; i < needed; i++) {
        rooms.push({
          roomNumber: rooms.length + 1,
          students: [],
          genderType: 'Trống',
          hasPenalized: false,
        });
      }
    }

    return rooms;
  }, [students, MAX_PER_ROOM, INITIAL_ROOMS]);

  // Quản lý Realtime và unmount an toàn tránh trắng trang
  useEffect(() => {
    let isMounted = true;
    let channel: any = null;

    const fetchRoomConfigFromDB = async () => {
      try {
        const { data, error } = await supabase
          .from('RoomConfig')
          .select('*')
          .eq('id', 1)
          .single();

        if (!error && data && isMounted) {
          setIsRoomLocked(!!data.isLocked);
          if (data.isLocked && data.locked_data) {
            setLockedRoomsData(data.locked_data);
          } else {
            setLockedRoomsData(null);
          }
        }
      } catch (err) {
        console.error('Lỗi tải RoomConfig:', err);
      }
    };

    fetchRoomConfigFromDB();

    try {
      channel = supabase
        .channel('room-allocation-unique-channel-' + Date.now())
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'DanhSachSinhVien' },
          async () => {
            if (setStudents && isMounted) {
              const { data, error } = await supabase.from('DanhSachSinhVien').select('*');
              if (!error && data && isMounted) {
                setStudents(data as unknown as Student[]);
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'RoomConfig' },
          async () => {
            try {
              const { data, error } = await supabase.from('RoomConfig').select('*').eq('id', 1).single();
              if (!error && data && isMounted) {
                setIsRoomLocked(!!data.isLocked);
                if (data.isLocked && data.locked_data) {
                  setLockedRoomsData(data.locked_data);
                } else {
                  setLockedRoomsData(null);
                }
              }
            } catch (err) {
              console.error('Lỗi realtime RoomConfig:', err);
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.error('Lỗi khởi tạo channel:', e);
    }

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
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
                .map((item: any) => item?.HoTen)
                .filter((name: string) => name && typeof name === 'string' && name.trim() !== '')
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

  // Lọc ra danh sách các sinh viên hiện đang vắng mặt (có thể chọn để đưa lại vào phòng)
  const absentStudentsList = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    return safeStudents.filter((s: any) => {
      if (!s) return false;
      return s.isAbsent || s.Vang === 'x';
    });
  }, [students]);

  // Hiển thị phòng dựa theo trạng thái khóa hoặc tạm tính nếu chưa khóa
  const getRoomsToDisplay = useMemo(() => {
    let baseRooms = (!isRoomLocked || !lockedRoomsData) ? calculateRoomAllocation() : lockedRoomsData;
    const safeStudents = Array.isArray(students) ? students : [];

    return baseRooms.map(room => {
      const uniqueStudentMap = new Map();
      
      (room.students || []).forEach(lockedStudent => {
        if (!lockedStudent) return;
        const mssv = String(lockedStudent.MSSV || (lockedStudent as any).studentId || lockedStudent.id);
        
        const freshStudent = safeStudents.find(s => 
          s && String(s.MSSV || (s as any).studentId || (s as any).id) === mssv
        );

        if (freshStudent) {
          if (!freshStudent.isAbsent && freshStudent.Vang !== 'x') {
            uniqueStudentMap.set(mssv, freshStudent);
          }
        } else {
          if (!(lockedStudent as any).isAbsent && (lockedStudent as any).Vang !== 'x') {
            uniqueStudentMap.set(mssv, lockedStudent);
          }
        }
      });

      return {
        ...room,
        students: Array.from(uniqueStudentMap.values()) as Student[]
      };
    });
  }, [isRoomLocked, lockedRoomsData, calculateRoomAllocation, students]);

  const rooms = getRoomsToDisplay;

  const handleConfirmAndSaveRooms = async () => {
    if (!canManage) return;
    setIsSavingRooms(true);

    try {
      const currentRoomsToSave = rooms; 
      const updates: { mssv: any; roomNumber: number }[] = [];

      currentRoomsToSave.forEach((room) => {
        (room.students || []).forEach((st: any) => {
          const mssvValue = st?.MSSV || st?.studentId || st?.id;
          if (mssvValue) {
            updates.push({
              mssv: mssvValue,
              roomNumber: room.roomNumber
            });
          }
        });
      });

      for (const item of updates) {
        const { error } = await supabase
          .from('DanhSachSinhVien')
          .update({ Phong: item.roomNumber })
          .eq('MSSV', item.mssv);

        if (error) {
          console.error(`Lỗi cập nhật phòng cho MSSV ${item.mssv}:`, error.message);
        }
      }

      setLockedRoomsData(currentRoomsToSave);
      setIsRoomLocked(true);

      const { error: configError } = await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: currentRoomsToSave
      });

      if (configError) {
        throw new Error(configError.message);
      }

      showToast('Đã lưu cố định sơ đồ phòng hiện tại thành công!', 'success');
    } catch (err: any) {
      console.error('Lỗi khi lưu phòng:', err);
      showToast('Lỗi khi lưu phòng: ' + (err?.message || err), 'error');
    } finally {
      setIsSavingRooms(false);
    }
  };

  const openAddStudentModalForRoom = (roomNum: number, roomGender: 'Nữ' | 'Nam' | 'Trống') => {
    setTargetRoomForAdd(roomNum);
    setTargetRoomGender(roomGender);
    setSelectedAbsentStudentId('');
    setIsAddStudentOpen(true);
  };

  // Logic chọn sinh viên vắng và đưa vào phòng (cập nhật Vang = null / false và Phong = roomNumber)
  const handleAssignAbsentStudentToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || targetRoomForAdd === null || !selectedAbsentStudentId) return;

    const studentToRestore = absentStudentsList.find((s: any) => {
      const sKey = String(s.MSSV || s.studentId || s.id);
      return sKey === selectedAbsentStudentId;
    });

    if (!studentToRestore) {
      showToast('Không tìm thấy sinh viên được chọn!', 'error');
      return;
    }

    // Kiểm tra giới tính nếu phòng đã có người
    const studentGender = String((studentToRestore as any).GioiTinh || (studentToRestore as any).gender || '').trim().toLowerCase();
    if (targetRoomGender !== 'Trống') {
      const isFemaleRoom = targetRoomGender === 'Nữ';
      const isStudentFemale = studentGender === 'nữ' || studentGender === 'nu';
      if (isFemaleRoom !== isStudentFemale) {
        showToast(`Không thể xếp sinh viên này vào phòng ${targetRoomGender} do lệch giới tính!`, 'error');
        return;
      }
    }

    setIsSubmittingAdd(true);

    try {
      const mssvValue = (studentToRestore as any).MSSV || (studentToRestore as any).studentId || studentToRestore.id;

      const { error } = await supabase
        .from('DanhSachSinhVien')
        .update({ Vang: null, Phong: targetRoomForAdd })
        .eq('MSSV', mssvValue);

      if (error) {
        showToast('Lỗi khi cập nhật sinh viên: ' + error.message, 'error');
        setIsSubmittingAdd(false);
        return;
      }

      const updatedStudentObj = {
        ...studentToRestore,
        Vang: null,
        isAbsent: false,
        Phong: targetRoomForAdd
      };

      if (setStudents) {
        setStudents((prev) =>
          (Array.isArray(prev) ? prev : []).map((s) => {
            if (!s) return s;
            const sKey = String(s.MSSV || (s as any).studentId || s.id);
            if (sKey === selectedAbsentStudentId) {
              return updatedStudentObj as unknown as Student;
            }
            return s;
          })
        );
      }

      let updatedLockedRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
      const roomIndex = updatedLockedRooms.findIndex(r => r.roomNumber === targetRoomForAdd);

      const resolvedGender = targetRoomGender === 'Trống' 
        ? ((studentGender === 'nữ' || studentGender === 'nu') ? 'Nữ' : 'Nam')
        : targetRoomGender;

      if (roomIndex >= 0) {
        updatedLockedRooms[roomIndex] = {
          ...updatedLockedRooms[roomIndex],
          genderType: updatedLockedRooms[roomIndex].genderType === 'Trống' ? resolvedGender : updatedLockedRooms[roomIndex].genderType,
          students: [...(updatedLockedRooms[roomIndex].students || []), updatedStudentObj as unknown as Student]
        };
      } else {
        updatedLockedRooms.push({
          roomNumber: targetRoomForAdd,
          students: [updatedStudentObj as unknown as Student],
          genderType: resolvedGender,
          hasPenalized: false
        });
      }

      const { error: configError } = await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: updatedLockedRooms
      });

      if (configError) {
        showToast('Lỗi cập nhật cấu hình phòng: ' + configError.message, 'error');
        setIsSubmittingAdd(false);
        return;
      }

      setLockedRoomsData(updatedLockedRooms);
      setIsRoomLocked(true);

      showToast(`Đã đưa sinh viên ${(studentToRestore as any).HoVaTen || (studentToRestore as any).name} vào Phòng ${targetRoomForAdd} thành công!`, 'success');
      
      setIsAddStudentOpen(false);
      setTargetRoomForAdd(null);
      setSelectedAbsentStudentId('');
    } catch (err: any) {
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
        .update({ Vang: 'x', Phong: null })
        .eq('MSSV', mssvValue);

      if (error) {
        showToast('Lỗi cập nhật CSDL: ' + error.message, 'error');
        setIsDeleting(false);
        return;
      }

      let updatedLockedRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
      
      updatedLockedRooms = updatedLockedRooms.map(room => ({
        ...room,
        students: (room.students || []).filter((st: any) => {
          if (!st) return false;
          const sKey = String(st.MSSV || st.studentId || st.id);
          return sKey !== studentKey;
        })
      }));

      setLockedRoomsData(updatedLockedRooms);

      await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: updatedLockedRooms
      });

      if (setStudents) {
        setStudents((prevStudents) =>
          (Array.isArray(prevStudents) ? prevStudents : []).map((s) => {
            if (!s) return s;
            const sKey = String(s.MSSV || (s as any).studentId || s.id);
            if (sKey === studentKey) {
              return { ...s, isAbsent: true, Vang: 'x', Phong: null };
            }
            return s;
          })
        );
      }

      showToast(`Đã đánh dấu vắng và xóa sinh viên khỏi phòng thành công.`, 'success');
    } catch (err) {
      showToast('Lỗi kết nối mạng.', 'error');
    } finally {
      setIsDeleting(false);
      setStudentToDelete(null);
    }
  };

  const toggleLockRooms = async () => {
    if (!canManage) return;

    if (!isRoomLocked) {
      const lockedState = calculateRoomAllocation();
      setLockedRoomsData(lockedState);
      setIsRoomLocked(true);

      try {
        await supabase.from('RoomConfig').upsert({ 
          id: 1, 
          isLocked: true,
          locked_data: lockedState 
        });
        showToast('Đã khóa cố định sơ đồ phòng thành công.', 'success');
      } catch (err: any) {
        showToast('Lỗi khi khóa phòng: ' + err.message, 'error');
      }
    } else {
      setLockedRoomsData(null);
      setIsRoomLocked(false);

      try {
        await supabase.from('RoomConfig').upsert({ 
          id: 1, 
          isLocked: false,
          locked_data: null 
        });
        showToast('Đã mở khóa sơ đồ phòng.', 'success');
      } catch (err: any) {
        showToast('Lỗi khi mở khóa phòng: ' + err.message, 'error');
      }
    }
  };

  const filteredRooms = useMemo(() => {
    return rooms.map((room) => {
      if (!selectedTeacherFilter) return room;
      const matchedStudents = (room.students || []).filter((st: any) => {
        if (!st) return false;
        const studentTeacher = String(st?.ThayCo || st?.thayCo || st?.HoTen || st?.hoTen || '');
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
      (room.students || []).forEach((st: any) => {
        if (!st) return;
        const studentKey = String(st.MSSV || st.studentId || st.id);
        assignments.push({ studentKey, roomNumber: room.roomNumber });
      });
    });

    onUpdateRoomData(assignments);
  }, [rooms, onUpdateRoomData, isRoomLocked]);

  useEffect(() => {
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = (room.students || []).find((st: any) => st && st.truongPhong === 'x');
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

    const roomStudentKeys = (currentRoom.students || []).map((st: any) => String(st.MSSV || st.studentId || st.id));

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

    const roomStudentKeys = (currentRoom.students || []).map((st: any) => String(st.MSSV || st.studentId || st.id));

    if (onSetRoomLeader) {
      onSetRoomLeader(null, roomStudentKeys);
    }
    showToast(`Đã hủy chức vụ trưởng phòng của Phòng ${roomNumber}.`, 'success');
  };

  const totalActiveAllocated = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.students ? r.students.length : 0), 0);
  }, [rooms]);

  const totalAbsent = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    return safeStudents.filter((s: any) => s && (s.isAbsent || s.Vang === 'x')).length;
  }, [students]);

  const { totalFemale, totalMale } = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    const validStudents = safeStudents.filter((s: any) => s && !s.isAbsent && s.Vang !== 'x');
    const femaleCount = validStudents.filter((s: any) => {
      const g = String(s?.GioiTinh || s?.gender || '').trim().toLowerCase();
      return g === 'nữ' || g === 'nu';
    }).length;
    const maleCount = validStudents.filter((s: any) => {
      const g = String(s?.GioiTinh || s?.gender || '').trim().toLowerCase();
      return g === 'nam';
    }).length;
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
                🔒 Đã khóa sơ đồ (Giữ cố định vị trí phòng)
              </span>
            )}
          </h2>
          <p>
            {isRoomLocked
              ? 'Phòng đã được khóa cố định. Bấm "Xác Nhận Phòng" để lưu lại cấu hình hiện tại.'
              : 'Đang hiển thị chế độ xem trước. Bấm "Xác Nhận Phòng" để lưu sơ đồ vào hệ thống.'}
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
            const activeRoomStudents = room.students || [];
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
                        title={`Chọn sinh viên vắng để đưa vào Phòng ${room.roomNumber}`}
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
                      if (!st) return null;
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
                  {activeRoomStudents.length === 0 ? (
                    <div className="empty-text">Phòng trống</div>
                  ) : (
                    activeRoomStudents.map((st: any, idx) => {
                      if (!st) return null;
                      const studentKey = String(st.MSSV || st.studentId || st.id);
                      const displayCode = st.MSSV || st.studentId || st.id;
                      const isLeader = currentLeaderKey === studentKey;
                      const studentName = st.HoVaTen || st.name;
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
                              {idx + 1}. {studentName} ({displayCode})
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

      {/* Modal chọn sinh viên vắng để đưa vào phòng thay vì nhập tay */}
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
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="#2563eb" />
                Đưa Sinh Viên Vắng Trở Lại Phòng {targetRoomForAdd}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddStudentOpen(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignAbsentStudentToRoom} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Chọn sinh viên đang vắng mặt từ danh sách:
                </label>
                {absentStudentsList.length === 0 ? (
                  <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', color: '#64748b', fontSize: '13px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    Hiện không có sinh viên nào đang ở trạng thái vắng mặt.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedAbsentStudentId}
                    onChange={(e) => setSelectedAbsentStudentId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">-- Chọn sinh viên vắng --</option>
                    {absentStudentsList.map((st: any) => {
                      const sKey = String(st.MSSV || st.studentId || st.id);
                      const sName = st.HoVaTen || st.name;
                      const sGender = st.GioiTinh || st.gender || '';
                      return (
                        <option key={sKey} value={sKey}>
                          {sName} ({sKey}) - Giới tính: {sGender}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                💡 Khi chọn và xác nhận, hệ thống sẽ tự động cập nhật trạng thái của sinh viên thành <strong>có mặt</strong> và xếp vào đúng Phòng {targetRoomForAdd}.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
                  disabled={isSubmittingAdd || absentStudentsList.length === 0 || !selectedAbsentStudentId}
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '6px', 
                    border: '1px solid #2563eb', 
                    background: (absentStudentsList.length === 0 || !selectedAbsentStudentId) ? '#93c5fd' : '#2563eb', 
                    color: '#ffffff', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    cursor: (absentStudentsList.length === 0 || !selectedAbsentStudentId) ? 'not-allowed' : 'pointer' 
                  }}
                >
                  {isSubmittingAdd ? 'Đang xử lý...' : 'Xác nhận đưa vào phòng'}
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
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
              Bạn có chắc chắn muốn đánh dấu sinh viên <strong>{(studentToDelete as any).HoVaTen || studentToDelete.name}</strong> ({studentToDelete.MSSV || (studentToDelete as any).studentId || studentToDelete.id}) là vắng mặt và xóa khỏi phòng không?
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