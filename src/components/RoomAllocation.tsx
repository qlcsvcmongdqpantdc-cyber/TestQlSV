import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Home, Users, AlertTriangle, Crown, UserCheck, Filter, Lock, Unlock, UserX, AlertCircle, UserPlus, CheckCircle, Plus, Edit3, Eye, Settings, Trash2, FileSpreadsheet, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
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

interface RecordEntry {
  code: string;
  displayCode: string;
  penalty: number;
}

type ScoringMap = Record<string, Record<number, RecordEntry[]>>;

interface ViolationRule {
  code: string;
  displayCode: string;
  label: string;
  penalty: number;
}

const DEFAULT_VIOLATIONS: ViolationRule[] = [];

interface RoomAllocationProps {
  students: Student[];
  setStudents?: React.Dispatch<React.SetStateAction<Student[]>>;
  onSetRoomLeader?: (leaderStudentId: string | null, roomStudentKeys: string[]) => void;
  onUpdateRoomData?: (roomAssignments: { studentKey: string; roomNumber: number }[]) => void;
  currentUser?: (AuthUser & { can_manage?: boolean }) | null;
}

const checkIsLate = (st: any): boolean => {
  if (!st) return false;
  if (st.isLate === true || st.isLate === 'true' || st.isLate === 1) return true;
  const val = st.DiTre ?? st.diTre ?? st.Di_Tre ?? st.ditre;
  if (val === true || val === 1) return true;
  const str = String(val || '').trim().toLowerCase();
  return str === 'x' || str === 'true' || str === '1';
};

const getStudentCode = (st: any): string => {
  if (!st) return '';
  return String(st.MSSV || st.studentId || st.id || st.MSV || '').trim();
};

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

  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [selectedRoomNumber, setSelectedRoomNumber] = useState<number>(1);

  const [editingRoomNumber, setEditingRoomNumber] = useState<number | null>(null);
  const [newTargetRoomValue, setNewTargetRoomValue] = useState<string>('');

  const [teacherList, setTeacherList] = useState<string[]>([]);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('');
  
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSavingRooms, setIsSavingRooms] = useState<boolean>(false);

  const [scores, setScores] = useState<ScoringMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [violations, setViolations] = useState<ViolationRule[]>(DEFAULT_VIOLATIONS);
  const [isViolationModalOpen, setIsViolationModalOpen] = useState<boolean>(false);
  
  const [isLateModalOpen, setIsLateModalOpen] = useState<boolean>(false);

  const [newCode, setNewCode] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newPenalty, setNewPenalty] = useState<number>(1);

  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [targetRoomForAdd, setTargetRoomForAdd] = useState<number | null>(null);
  const [targetRoomGender, setTargetRoomGender] = useState<'Nam' | 'Nữ' | 'Trống'>('Nam');
  
  const [addMethod, setAddMethod] = useState<'absent' | 'manual'>('absent');
  const [selectedAbsentStudentId, setSelectedAbsentStudentId] = useState<string>('');
  
  const [manualMssv, setManualMssv] = useState<string>('');
  const [manualName, setManualName] = useState<string>('');
  const [manualGender, setManualGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [manualTeacher, setManualTeacher] = useState<string>('');

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
  const [extraEmptyRooms, setExtraEmptyRooms] = useState<{ gender: 'Nam' | 'Nữ' }[]>([]);

  useEffect(() => {
    const fetchScoringData = async () => {
      try {
        const { data: ruleData } = await supabase.from('ViolationRules').select('*');
        if (ruleData && ruleData.length > 0) {
          const customRules = ruleData.map((r: any) => ({
            code: r.Code || r.code,
            displayCode: r.DisplayCode || r.displayCode || r.Code || r.code,
            label: r.Label || r.label || `Lỗi: ${r.Code || r.code}`,
            penalty: Number(r.Penalty ?? r.penalty) || 1,
          }));
          const mapRules = new Map();
          DEFAULT_VIOLATIONS.forEach(v => mapRules.set(v.code, v));
          customRules.forEach(v => mapRules.set(v.code, v));
          setViolations(Array.from(mapRules.values()));
        }

        const { data: scoreData } = await supabase.from('ChamDiem').select('*');
        if (scoreData && scoreData.length > 0) {
          const loadedScores: ScoringMap = {};
          const loadedNotes: Record<string, string> = {};
          scoreData.forEach((row: any) => {
            const msv = String(row.MSV || row.msv || '');
            if (!msv) return;
            loadedNotes[msv] = row.GhiChu || row.ghiChu || '';
            loadedScores[msv] = {};
            for (let day = 1; day <= 10; day++) {
              const dayValue = row[String(day)] || row[day];
              if (dayValue) {
                const codes = String(dayValue).split(',');
                const dayEntries: RecordEntry[] = [];
                codes.forEach((c) => {
                  const trimmedCode = c.trim();
                  const target = violations.find((v) => v.code === trimmedCode || v.displayCode === trimmedCode);
                  if (target) {
                    dayEntries.push({ code: target.code, displayCode: target.displayCode, penalty: target.penalty });
                  } else if (trimmedCode) {
                    dayEntries.push({ code: trimmedCode, displayCode: trimmedCode, penalty: 1 });
                  }
                });
                if (dayEntries.length > 0) loadedScores[msv][day] = dayEntries;
              }
            }
          });
          setScores(loadedScores);
          setNotes(loadedNotes);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu chấm điểm:', err);
      }
    };
    fetchScoringData();
  }, [violations]);

  const calculateFinalScore = useCallback((studentKey: string) => {
    const studentData = scores[studentKey];
    if (!studentData) return 10;
    let totalPenalty = 0;
    Object.values(studentData).forEach((dayData) => {
      dayData.forEach((item) => { totalPenalty += item.penalty; });
    });
    return Math.max(0, 10 - totalPenalty);
  }, [scores]);

  // --- HÀM LƯU ĐIỂM TỰ ĐỘNG LÊN SUPABASE NGAY LẬP TỨC CHO TỪNG HỌC SINH ---
  const saveStudentScoreToDB = async (studentKey: string, updatedStudentScores: Record<number, RecordEntry[]>) => {
    try {
      let hoVaTen = '';
      let roomNum: number | null = null;

      rooms.forEach(r => {
        (r.students || []).forEach((st: any) => {
          if (getStudentCode(st) === studentKey) {
            hoVaTen = st.HoVaTen || st.name || '';
            roomNum = r.roomNumber;
          }
        });
      });

      if (!hoVaTen) {
        const foundAbsent = absentStudentsList.find((s: any) => getStudentCode(s) === studentKey);
        if (foundAbsent) {
          hoVaTen = (foundAbsent as any).HoVaTen || (foundAbsent as any).name || '';
        }
      }

      const finalScore = Math.max(0, 10 - Object.values(updatedStudentScores).reduce((acc, dayItems) => {
        return acc + dayItems.reduce((sum, item) => sum + item.penalty, 0);
      }, 0));

      const dayDataRecord: Record<string, string | null> = {};
      for (let day = 1; day <= 10; day++) {
        const entries = updatedStudentScores[day] || [];
        dayDataRecord[String(day)] = entries.length > 0 ? entries.map(e => e.code).join(', ') : null;
      }

      const rowPayload = {
        MSV: studentKey,
        HoVaTen: hoVaTen || studentKey,
        DiemNeNep: finalScore,
        Phong: roomNum,
        ...dayDataRecord
      };

      await supabase
        .from('ChamDiem')
        .upsert([rowPayload], { onConflict: 'MSV' });

    } catch (err) {
      console.error('Lỗi auto-save điểm:', err);
    }
  };

  const handleToggleViolation = async (studentKey: string, day: number, code: string, displayCode: string, penalty: number) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.can_manage !== true)) {
      showToast('Bạn không có quyền thay đổi điểm nề nếp!', 'error');
      return;
    }

    setScores((prev) => {
      const studentData = prev[studentKey] || {};
      const dayData = studentData[day] || [];
      const exists = dayData.some((item) => item.code === code);
      const updatedDayData = exists ? dayData.filter((item) => item.code !== code) : [...dayData, { code, displayCode, penalty }];
      
      const newStudentScores = { ...studentData, [day]: updatedDayData };
      const newAllScores = { ...prev, [studentKey]: newStudentScores };

      // Gọi lưu thẳng lên DB ngầm lập tức
      saveStudentScoreToDB(studentKey, newStudentScores);

      return newAllScores;
    });
  };

  const handleViolationSelectChange = async (studentKey: string, day: number, e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    const targetElement = e.target;
    
    if (!selectedValue) return;

    if (selectedValue === 'MANAGE_RULES') {
      setIsViolationModalOpen(true);
    } else if (selectedValue === 'ADD_CUSTOM') {
      const codeInput = prompt('Nhập mã/ký tự lỗi tự chọn (VD: OT, VSTH...):');
      if (!codeInput || !codeInput.trim()) {
        targetElement.value = '';
        return;
      }
      const penaltyInput = prompt(`Nhập số điểm trừ cho lỗi [${codeInput.trim().toUpperCase()}]:`, '1');
      const penalty = parseFloat(penaltyInput || '1');
      if (isNaN(penalty) || penalty <= 0) {
        showToast('Số điểm trừ không hợp lệ!', 'error');
        targetElement.value = '';
        return;
      }

      const formattedCode = codeInput.trim().toUpperCase();
      const newRule = {
        code: formattedCode,
        displayCode: formattedCode,
        label: `Tự chọn: ${formattedCode}`,
        penalty: penalty,
      };

      try {
        await supabase.from('ViolationRules').upsert({
          Code: newRule.code,
          DisplayCode: newRule.displayCode,
          Label: newRule.label,
          Penalty: newRule.penalty,
        }, { onConflict: 'Code' });
      } catch (err) {
        console.error(err);
      }

      setViolations((prev) => {
        if (prev.some(v => v.code === newRule.code)) return prev;
        return [...prev, newRule];
      });

      await handleToggleViolation(studentKey, day, newRule.code, newRule.displayCode, newRule.penalty);
    } else {
      const target = violations.find((v) => v.code === selectedValue);
      if (target) {
        await handleToggleViolation(studentKey, day, target.code, target.displayCode, target.penalty);
      }
    }

    targetElement.value = '';
  };

  const handleAddRuleFromModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    const formattedCode = newCode.trim().toUpperCase();
    const rule = {
      code: formattedCode,
      displayCode: formattedCode,
      label: newLabel.trim() || `Lỗi: ${formattedCode}`,
      penalty: Number(newPenalty) || 1,
    };

    const { error } = await supabase.from('ViolationRules').upsert({
      Code: rule.code,
      DisplayCode: rule.displayCode,
      Label: rule.label,
      Penalty: rule.penalty,
    }, { onConflict: 'Code' });

    if (error) {
      showToast('Lỗi khi lưu danh mục lên cơ sở dữ liệu!', 'error');
      return;
    }

    setViolations((prev) => {
      const filtered = prev.filter(v => v.code !== rule.code);
      return [...filtered, rule];
    });

    setNewCode('');
    setNewLabel('');
    setNewPenalty(1);
    showToast('Thêm / Cập nhật quy định lỗi thành công!', 'success');
  };

  const handleDeleteRule = async (codeToDelete: string) => {
    if (DEFAULT_VIOLATIONS.some(v => v.code === codeToDelete)) {
      showToast('Không thể xóa các lỗi mặc định hệ thống!', 'error');
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa quy định lỗi [${codeToDelete}] không?`)) {
      await supabase.from('ViolationRules').delete().eq('Code', codeToDelete);
      setViolations(prev => prev.filter(v => v.code !== codeToDelete));
      showToast('Đã xóa quy định lỗi!', 'success');
    }
  };

  const calculateRoomAllocation = useCallback((): Room[] => {
    const safeStudents = Array.isArray(students) ? students : [];
    const allValidStudents = safeStudents.filter((s: any) => {
      if (!s) return false;
      if (s.isAbsent || s.Vang === 'x' || s.Vang === 'X') return false;
      return true;
    });

    const normalizeGender = (val: any) => {
      if (!val) return '';
      return String(val).trim().toLowerCase();
    };

    const sortByName = (group: Student[]) => {
      return group.sort((a, b) => {
        const fullNameA = String((a as any)?.HoVaTen || (a as any)?.name || '').trim();
        const fullNameB = String((b as any)?.HoVaTen || (b as any)?.name || '').trim();

        const partsA = fullNameA.split(/\s+/);
        const partsB = fullNameB.split(/\s+/);

        const firstNameA = partsA[partsA.length - 1] || '';
        const firstNameB = partsB[partsB.length - 1] || '';

        const cmp = firstNameA.localeCompare(firstNameB, 'vi', { sensitivity: 'accent' });
        if (cmp !== 0) return cmp;
        return fullNameA.localeCompare(fullNameB, 'vi', { sensitivity: 'accent' });
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
      const teacherInsertionOrder: string[] = [];
      
      group.forEach((s: any) => {
        const teacher = String(s?.ThayCo || s?.thayCo || s?.HoTen || s?.hoTen || 'Chưa phân công').trim();
        if (!teacherMap[teacher]) {
          teacherMap[teacher] = [];
          teacherInsertionOrder.push(teacher);
        }
        teacherMap[teacher].push(s);
      });

      let orderedList: Student[] = [];
      teacherInsertionOrder.forEach(teacher => {
        const sortedStudentsOfTeacher = sortByName(teacherMap[teacher]);
        orderedList = orderedList.concat(sortedStudentsOfTeacher);
      });

      return orderedList;
    };

    const processedFemales = groupAndSortByTeacher(allFemales);
    const processedMales = groupAndSortByTeacher(allMales);

    const rooms: Room[] = [];

    const fillToRooms = (group: Student[], gender: 'Nữ' | 'Nam') => {
      if (group.length === 0) return;
      let index = 0;
      while (index < group.length) {
        const chunk = group.slice(index, index + MAX_PER_ROOM);
        rooms.push({
          roomNumber: 0,
          students: chunk,
          genderType: gender,
          hasPenalized: false,
        });
        index += MAX_PER_ROOM;
      }
    };

    fillToRooms(processedFemales, 'Nữ');
    
    const extraFemaleRooms = extraEmptyRooms.filter(r => r.gender === 'Nữ');
    extraFemaleRooms.forEach(() => {
      rooms.push({
        roomNumber: 0,
        students: [],
        genderType: 'Nữ',
        hasPenalized: false,
      });
    });

    fillToRooms(processedMales, 'Nam');

    const extraMaleRooms = extraEmptyRooms.filter(r => r.gender === 'Nam');
    extraMaleRooms.forEach(() => {
      rooms.push({
        roomNumber: 0,
        students: [],
        genderType: 'Nam',
        hasPenalized: false,
      });
    });

    if (rooms.length < INITIAL_ROOMS) {
      const needed = INITIAL_ROOMS - rooms.length;
      for (let i = 0; i < needed; i++) {
        rooms.push({
          roomNumber: 0,
          students: [],
          genderType: 'Trống',
          hasPenalized: false,
        });
      }
    }

    return rooms.map((r, idx) => ({ ...r, roomNumber: idx + 1 }));
  }, [students, MAX_PER_ROOM, INITIAL_ROOMS, extraEmptyRooms]);

  const handleAddExtraRoom = async (gender: 'Nam' | 'Nữ') => {
    if (!canManage) return;
    setExtraEmptyRooms(prev => [...prev, { gender }]);

    let currentRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
    const newRoom: Room = {
      roomNumber: 0,
      students: [],
      genderType: gender,
      hasPenalized: false,
    };

    if (gender === 'Nữ') {
      let lastFemaleIdx = -1;
      currentRooms.forEach((r, idx) => {
        if (r.genderType === 'Nữ') lastFemaleIdx = idx;
      });
      if (lastFemaleIdx !== -1) {
        currentRooms.splice(lastFemaleIdx + 1, 0, newRoom);
      } else {
        currentRooms.unshift(newRoom);
      }
    } else {
      let lastMaleIdx = -1;
      currentRooms.forEach((r, idx) => {
        if (r.genderType === 'Nam') lastMaleIdx = idx;
      });
      if (lastMaleIdx !== -1) {
        currentRooms.splice(lastMaleIdx + 1, 0, newRoom);
      } else {
        currentRooms.push(newRoom);
      }
    }

    const reindexedRooms = currentRooms.map((r, idx) => ({ ...r, roomNumber: idx + 1 }));
    setLockedRoomsData(reindexedRooms);
    setIsRoomLocked(true);

    try {
      await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: reindexedRooms
      });
    } catch (err) {
      console.error(err);
    }

    showToast(`Đã thêm 1 phòng ${gender} mới thành công!`, 'success');
  };

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

  const absentStudentsList = useMemo(() => {
    const safeStudents = Array.isArray(students) ? students : [];
    return safeStudents.filter((s: any) => {
      if (!s) return false;
      return s.isAbsent || s.Vang === 'x' || s.Vang === 'X';
    });
  }, [students]);

  const getRoomsToDisplay = useMemo(() => {
    let baseRooms = (!isRoomLocked || !lockedRoomsData) ? calculateRoomAllocation() : lockedRoomsData;
    const safeStudents = Array.isArray(students) ? students : [];

    return baseRooms.map(room => {
      const updatedStudents = (room.students || []).map(lockedStudent => {
        if (!lockedStudent) return null;
        const mssv = getStudentCode(lockedStudent);
        
        const freshStudent = safeStudents.find(s => s && getStudentCode(s) === mssv);

        if (freshStudent) {
          const isLateVal = checkIsLate(freshStudent) || checkIsLate(lockedStudent);
          return {
            ...lockedStudent,
            ...freshStudent,
            isLate: isLateVal,
            DiTre: isLateVal ? 'x' : null
          };
        }

        const isLateVal = checkIsLate(lockedStudent);
        return {
          ...lockedStudent,
          isLate: isLateVal,
          DiTre: isLateVal ? 'x' : null
        };
      }).filter((s): s is any => {
        if (!s) return false;
        return !s.isAbsent && s.Vang !== 'x' && s.Vang !== 'X';
      });

      return {
        ...room,
        students: updatedStudents as unknown as Student[]
      };
    });
  }, [isRoomLocked, lockedRoomsData, calculateRoomAllocation, students]);

  const rooms = getRoomsToDisplay;

  const lateStudentsList = useMemo(() => {
    const result: { student: any; roomNumber: number }[] = [];
    
    rooms.forEach(room => {
      (room.students || []).forEach((st: any) => {
        if (!st) return;
        if (checkIsLate(st)) {
          result.push({ student: st, roomNumber: room.roomNumber });
        }
      });
    });

    const safeStudents = Array.isArray(students) ? students : [];
    safeStudents.forEach((st: any) => {
      if (!st || st.isAbsent || st.Vang === 'x' || st.Vang === 'X') return;
      const mssv = getStudentCode(st);
      const existsInResult = result.some(r => getStudentCode(r.student) === mssv);
      if (!existsInResult && checkIsLate(st)) {
        result.push({ student: st, roomNumber: st.Phong || (st as any).room || 0 });
      }
    });

    return result;
  }, [rooms, students]);

  const handleExportExcel = () => {
    const allAssignedStudents = rooms.flatMap((room) => 
      (room.students || []).map((st: any) => ({
        ...st,
        Phong: room.roomNumber
      }))
    );

    if (allAssignedStudents.length === 0) {
      showToast('Không có dữ liệu sinh viên trong phòng để xuất Excel!', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();

    const allStudentsData = allAssignedStudents.map((st: any, idx: number) => {
      const studentKey = getStudentCode(st);
      const finalScore = calculateFinalScore(studentKey);
      const studentScores = scores[studentKey] || {};
      const isLate = checkIsLate(st);

      const row: Record<string, any> = {
        'STT': idx + 1,
        'MSV': getStudentCode(st),
        'Họ và Tên': st.HoVaTen || st.name || '',
        'Trạng thái': isLate ? 'Đi trễ' : 'Đúng giờ',
        'Phòng': st.Phong || '',
        'Giảng viên': st.ThayCo || st.thayCo || st.HoTen || st.hoTen || '',
        'Điểm Nề Nếp': finalScore,
      };

      for (let day = 1; day <= 10; day++) {
        row[`Ngày ${day}`] = (studentScores[day] || []).map((e) => e.displayCode).join(', ');
      }
      row['Ghi chú'] = notes[studentKey] || '';
      return row;
    });

    const wsAll = XLSX.utils.json_to_sheet(allStudentsData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tat_Ca_Phong');

    rooms.forEach((room) => {
      if (room.students && room.students.length > 0) {
        const roomData = room.students.map((st: any, idx: number) => {
          const studentKey = getStudentCode(st);
          const finalScore = calculateFinalScore(studentKey);
          const studentScores = scores[studentKey] || {};
          const isLate = checkIsLate(st);

          const row: Record<string, any> = {
            'STT': idx + 1,
            'MSV': getStudentCode(st),
            'Họ và Tên': st.HoVaTen || st.name || '',
            'Trạng thái': isLate ? 'Đi trễ' : 'Đúng giờ',
            'Phòng': room.roomNumber,
            'Giảng viên': st.ThayCo || st.thayCo || st.HoTen || st.hoTen || '',
            'Điểm Nề Nếp': finalScore,
          };

          for (let day = 1; day <= 10; day++) {
            row[`Ngày ${day}`] = (studentScores[day] || []).map((e) => e.displayCode).join(', ');
          }
          row['Ghi chú'] = notes[studentKey] || '';
          return row;
        });

        const wsRoom = XLSX.utils.json_to_sheet(roomData);
        const safeSheetName = `Phong_${room.roomNumber}`.replace(/[\/\\?\*:[\]]/g, '_').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, wsRoom, safeSheetName);
      }
    });

    XLSX.writeFile(wb, `Phan_Phong_Va_Cham_Diem_KTX_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Xuất file Excel thành công!', 'success');
  };

  const handleUpdateSingleRoomNumber = async (oldRoomNum: number) => {
    if (!canManage) return;
    const newRoomNum = parseInt(newTargetRoomValue, 10);

    if (isNaN(newRoomNum) || newRoomNum <= 0) {
      showToast('Vui lòng nhập số phòng hợp lệ lớn hơn 0!', 'error');
      return;
    }

    if (oldRoomNum === newRoomNum) {
      setEditingRoomNumber(null);
      return;
    }

    try {
      const targetRoomObj = rooms.find(r => r.roomNumber === oldRoomNum);
      if (!targetRoomObj || !targetRoomObj.students || targetRoomObj.students.length === 0) {
        showToast('Phòng này đang trống, không có sinh viên để đổi số phòng!', 'error');
        setEditingRoomNumber(null);
        return;
      }

      for (const st of targetRoomObj.students) {
        const mssvValue = getStudentCode(st);
        const hoVaTen = st?.name || (st as any).HoVaTen || '';
        if (mssvValue) {
          await supabase
            .from('DanhSachSinhVien')
            .update({ Phong: newRoomNum })
            .eq('MSSV', mssvValue);

          await supabase
            .from('ChamDiem')
            .upsert({
              MSV: mssvValue,
              HoVaTen: hoVaTen,
              Phong: newRoomNum
            }, { onConflict: 'MSV' });
        }
      }

      let updatedLockedRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
      
      updatedLockedRooms = updatedLockedRooms.map(r => {
        if (r.roomNumber === oldRoomNum) {
          return { ...r, roomNumber: newRoomNum };
        }
        return r;
      });

      setLockedRoomsData(updatedLockedRooms);
      setIsRoomLocked(true);

      await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: updatedLockedRooms
      });

      showToast(`Đã chuyển toàn bộ sinh viên từ Phòng ${oldRoomNum} sang Phòng ${newRoomNum} thành công!`, 'success');
      setEditingRoomNumber(null);
      setNewTargetRoomValue('');
    } catch (err: any) {
      console.error('Lỗi khi đổi số phòng:', err);
      showToast('Lỗi khi đổi số phòng: ' + (err?.message || err), 'error');
    }
  };

  const handleConfirmAndSaveRooms = async () => {
    if (!canManage) return;
    setIsSavingRooms(true);

    try {
      const currentRoomsToSave = rooms; 

      for (const room of currentRoomsToSave) {
        for (const st of (room.students || [])) {
          const mssvValue = getStudentCode(st);
          const hoVaTen = st?.name || (st as any).HoVaTen || '';
          if (mssvValue) {
            await supabase
              .from('DanhSachSinhVien')
              .update({ Phong: room.roomNumber, Vang: null })
              .eq('MSSV', mssvValue);

            await supabase
              .from('ChamDiem')
              .upsert({
                MSV: mssvValue,
                HoVaTen: hoVaTen,
                Phong: room.roomNumber
              }, { onConflict: 'MSV' });
          }
        }
      }

      for (const st of absentStudentsList) {
        const mssvValue = getStudentCode(st);
        const hoVaTen = (st as any).HoVaTen || (st as any).name || '';
        if (mssvValue) {
          await supabase
            .from('DanhSachSinhVien')
            .update({ Phong: null, Vang: 'x' })
            .eq('MSSV', mssvValue);

          await supabase
            .from('ChamDiem')
            .upsert({
              MSV: mssvValue,
              HoVaTen: hoVaTen,
              Phong: null
            }, { onConflict: 'MSV' });
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

      showToast('Đã lưu cố định sơ đồ phòng và đồng bộ số phòng lên CSDL thành công!', 'success');
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
    setAddMethod('absent');
    setManualMssv('');
    setManualName('');
    setManualGender(roomGender === 'Nữ' ? 'Nữ' : 'Nam');
    setManualTeacher('');
    setIsAddStudentOpen(true);
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || targetRoomForAdd === null) return;

    setIsSubmittingAdd(true);

    try {
      let updatedStudentObj: any = null;
      let mssvValue = '';
      let hoVaTen = '';
      let studentGender = '';

      if (addMethod === 'absent') {
        if (!selectedAbsentStudentId) {
          showToast('Vui lòng chọn sinh viên vắng mặt!', 'error');
          setIsSubmittingAdd(false);
          return;
        }

        const studentToRestore = absentStudentsList.find((s: any) => getStudentCode(s) === selectedAbsentStudentId);

        if (!studentToRestore) {
          showToast('Không tìm thấy sinh viên được chọn!', 'error');
          setIsSubmittingAdd(false);
          return;
        }

        studentGender = String((studentToRestore as any).GioiTinh || (studentToRestore as any).gender || '').trim().toLowerCase();
        if (targetRoomGender !== 'Trống') {
          const isFemaleRoom = targetRoomGender === 'Nữ';
          const isStudentFemale = studentGender === 'nữ' || studentGender === 'nu';
          if (isFemaleRoom !== isStudentFemale) {
            showToast(`Không thể xếp sinh viên này vào phòng ${targetRoomGender} do lệch giới tính!`, 'error');
            setIsSubmittingAdd(false);
            return;
          }
        }

        mssvValue = getStudentCode(studentToRestore);
        hoVaTen = (studentToRestore as any).HoVaTen || (studentToRestore as any).name || '';

        await supabase
          .from('DanhSachSinhVien')
          .update({ Vang: null, Phong: targetRoomForAdd, DiTre: 'x', isLate: true, late_at: new Date().toISOString() })
          .eq('MSSV', mssvValue);

        await supabase
          .from('ChamDiem')
          .upsert({
            MSV: mssvValue,
            HoVaTen: hoVaTen,
            Phong: targetRoomForAdd
          }, { onConflict: 'MSV' });

        updatedStudentObj = {
          ...studentToRestore,
          Vang: null,
          isAbsent: false,
          Phong: targetRoomForAdd,
          DiTre: 'x',
          isLate: true,
          late_at: new Date().toISOString()
        };

        if (setStudents) {
          setStudents((prev) =>
            (Array.isArray(prev) ? prev : []).map((s) => {
              if (!s) return s;
              if (getStudentCode(s) === selectedAbsentStudentId) {
                return updatedStudentObj as unknown as Student;
              }
              return s;
            })
          );
        }
      } else {
        if (!manualMssv.trim() || !manualName.trim()) {
          showToast('Vui lòng nhập đầy đủ MSSV và Họ tên!', 'error');
          setIsSubmittingAdd(false);
          return;
        }

        mssvValue = manualMssv.trim();
        hoVaTen = manualName.trim();
        studentGender = manualGender;
        const teacherVal = manualTeacher.trim() || 'Chưa phân công';

        if (targetRoomGender !== 'Trống') {
          if (targetRoomGender !== manualGender) {
            showToast(`Giới tính sinh viên (${manualGender}) không khớp với loại phòng (${targetRoomGender})!`, 'error');
            setIsSubmittingAdd(false);
            return;
          }
        }

        const newStudentPayload = {
          MSSV: mssvValue,
          HoVaTen: hoVaTen,
          GioiTinh: manualGender,
          ThayCo: teacherVal,
          Phong: targetRoomForAdd,
          Vang: null,
          DiTre: 'x',
          isLate: true,
          late_at: new Date().toISOString()
        };

        const { data: existingStudent } = await supabase
          .from('DanhSachSinhVien')
          .select('MSSV')
          .eq('MSSV', mssvValue)
          .maybeSingle();

        let insertError;
        if (existingStudent) {
          const { error } = await supabase
            .from('DanhSachSinhVien')
            .update(newStudentPayload)
            .eq('MSSV', mssvValue);
          insertError = error;
        } else {
          const { error } = await supabase
            .from('DanhSachSinhVien')
            .insert([newStudentPayload]);
          insertError = error;
        }

        if (insertError) {
          showToast('Lỗi khi thêm sinh viên vào CSDL: ' + insertError.message, 'error');
          setIsSubmittingAdd(false);
          return;
        }

        await supabase
          .from('ChamDiem')
          .upsert({
            MSV: mssvValue,
            HoVaTen: hoVaTen,
            Phong: targetRoomForAdd
          }, { onConflict: 'MSV' });

        updatedStudentObj = newStudentPayload;

        if (setStudents) {
          setStudents((prev) => [...(Array.isArray(prev) ? prev : []), updatedStudentObj as unknown as Student]);
        }
      }

      let updatedLockedRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
      const roomIndex = updatedLockedRooms.findIndex(r => r.roomNumber === targetRoomForAdd);

      const resolvedGender = targetRoomGender === 'Trống' 
        ? ((studentGender.toLowerCase().includes('nữ') || studentGender.toLowerCase().includes('nu')) ? 'Nữ' : 'Nam')
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

      await supabase.from('RoomConfig').upsert({
        id: 1,
        isLocked: true,
        locked_data: updatedLockedRooms
      });

      setLockedRoomsData(updatedLockedRooms);
      setIsRoomLocked(true);

      showToast(`Đã thêm sinh viên vào Phòng ${targetRoomForAdd} và đánh dấu đi trễ!`, 'success');
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
    const studentKey = getStudentCode(studentToDelete);

    try {
      const mssvValue = getStudentCode(studentToDelete);
      const hoVaTen = (studentToDelete as any).HoVaTen || (studentToDelete as any).name || '';

      await supabase
        .from('DanhSachSinhVien')
        .update({ Vang: 'x', Phong: null })
        .eq('MSSV', mssvValue);

      await supabase
        .from('ChamDiem')
        .upsert({
          MSV: mssvValue,
          HoVaTen: hoVaTen,
          Phong: null
        }, { onConflict: 'MSV' });

      let updatedLockedRooms = lockedRoomsData ? [...lockedRoomsData] : calculateRoomAllocation();
      
      updatedLockedRooms = updatedLockedRooms.map(room => ({
        ...room,
        students: (room.students || []).filter((st: any) => {
          if (!st) return false;
          return getStudentCode(st) !== studentKey;
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
            if (getStudentCode(s) === studentKey) {
              return { ...s, isAbsent: true, Vang: 'x', Phong: null };
            }
            return s;
          })
        );
      }

      showToast(`Đã đánh dấu vắng và xóa sinh viên khỏi phòng.`, 'success');
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
    const query = searchTerm.trim().toLowerCase();

    let baseRooms = rooms;
    if (viewMode === 'single') {
      baseRooms = rooms.filter(r => r.roomNumber === selectedRoomNumber);
    }

    return baseRooms.map((room) => {
      const matchedStudents = (room.students || []).filter((st: any) => {
        if (!st) return false;
        const studentTeacher = String(st?.ThayCo || st?.thayCo || st?.HoTen || st?.hoTen || '');
        const teacherMatch = !selectedTeacherFilter || studentTeacher === selectedTeacherFilter;

        if (!query) return teacherMatch;

        const name = String(st?.HoVaTen || st?.name || '').toLowerCase();
        const mssv = getStudentCode(st).toLowerCase();
        const searchMatch = name.includes(query) || mssv.includes(query);

        return teacherMatch && searchMatch;
      });

      const hasMatch = (selectedTeacherFilter || query) ? matchedStudents.length > 0 : true;

      return {
        ...room,
        matchedStudents,
        hasMatch
      };
    }).filter((room) => {
      if (!selectedTeacherFilter && !searchTerm) return true;
      return room.hasMatch;
    });
  }, [rooms, selectedTeacherFilter, searchTerm, viewMode, selectedRoomNumber]);

  useEffect(() => {
    if (!onUpdateRoomData || isRoomLocked) return;

    const assignments: { studentKey: string; roomNumber: number }[] = [];
    rooms.forEach((room) => {
      (room.students || []).forEach((st: any) => {
        if (!st) return;
        const studentKey = getStudentCode(st);
        assignments.push({ studentKey, roomNumber: room.roomNumber });
      });
    });

    onUpdateRoomData(assignments);
  }, [rooms, onUpdateRoomData, isRoomLocked]);

  useEffect(() => {
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = (room.students || []).find((st: any) => st && (st.truongPhong === 'x' || st.truongPhong === 'X'));
      if (leaderStudent) {
        const studentKey = getStudentCode(leaderStudent);
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

    const roomStudentKeys = (currentRoom.students || []).map((st: any) => getStudentCode(st));

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

    const roomStudentKeys = (currentRoom.students || []).map((st: any) => getStudentCode(st));

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
    return safeStudents.filter((s: any) => s && (s.isAbsent || s.Vang === 'x' || s.Vang === 'X')).length;
  }, [students]);

  return (
    <div className="room-container modern-ui" style={{ position: 'relative' }}>
      {toastMessage && (
        <div className={`toast-notification ${toastMessage.type}`}>
          {toastMessage.type === 'success' ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#dc2626" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* CỤM BANNER HEADER TRÊN CÙNG */}
      <div className="room-header" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              Phân phòng & Chấm điểm nề nếp KTX 
              <span className="room-count-badge" style={{ fontSize: '13px', background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', color: '#334155' }}>
                ({rooms.length} Phòng)
              </span>
              {isRoomLocked && (
                <span className="locked-tag" style={{ fontSize: '12px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', border: '1px solid #fcd34d' }}>
                  🔒 Đã khóa sơ đồ
                </span>
              )}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
              Quản lý phân phòng sinh viên và chấm điểm nề nếp trong cùng một giao diện trực quan.
            </p>
          </div>

          <div className="room-stats" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0f9ff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '13px' }}>
              <Users size={16} color="#0284c7" />
              <span>Tổng SV: <strong>{totalActiveAllocated} SV</strong></span>
            </div>
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
              <Home size={16} color="#475569" />
              <span>Phòng: <strong>{rooms.length}</strong></span>
            </div>
            <div className="stat-card warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', padding: '6px 12px', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '13px', color: '#dc2626' }}>
              <AlertTriangle size={16} color="#dc2626" />
              <span>Vắng: <strong>{totalAbsent} SV</strong></span>
            </div>

            <button
              type="button"
              onClick={() => setIsLateModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: '#fef3c7', padding: '6px 12px',
                borderRadius: '8px', border: '1px solid #fcd34d', fontSize: '13px', color: '#b45309', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              title="Xem danh sách sinh viên đi trễ"
            >
              <Clock size={16} color="#d97706" />
              <span>Trễ: <strong>{lateStudentsList.length} SV</strong></span>
            </button>
          </div>
        </div>

        {canManage && (
          <div 
            className="header-actions-toolbar" 
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              justifyContent: 'flex-start',
              background: '#ffffff',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <button
              type="button"
              onClick={() => handleAddExtraRoom('Nữ')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: '1px solid #fbcfe8', backgroundColor: '#fce7f3', color: '#db2777', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Plus size={15} /> Thêm phòng Nữ
            </button>

            <button
              type="button"
              onClick={() => handleAddExtraRoom('Nam')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: '1px solid #bfdbfe', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Plus size={15} /> Thêm phòng Nam
            </button>

            <div style={{ height: '24px', width: '1px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />

            <button
              type="button"
              onClick={() => setIsViolationModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: 'none', backgroundColor: '#4f46e5', color: '#ffffff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Settings size={15} /> Quản lý danh mục lỗi
            </button>

            <button
              type="button"
              onClick={handleConfirmAndSaveRooms}
              disabled={isSavingRooms}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <CheckCircle size={15} />
              {isSavingRooms ? 'Đang lưu...' : 'Xác Nhận Phòng'}
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: 'none', backgroundColor: '#0284c7', color: '#ffffff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
              title="Xuất Excel theo từng phòng"
            >
              <FileSpreadsheet size={15} /> Xuất Excel
            </button>

            <button
              type="button"
              onClick={toggleLockRooms}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px',
                border: isRoomLocked ? '1px solid #fca5a5' : '1px solid #cbd5e1',
                backgroundColor: isRoomLocked ? '#fef2f2' : '#f8fafc',
                color: isRoomLocked ? '#dc2626' : '#334155',
                fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {isRoomLocked ? <Lock size={15} /> : <Unlock size={15} />}
              {isRoomLocked ? 'Mở Khóa' : 'Khóa Cố Định'}
            </button>
          </div>
        )}
      </div>

      <div className="view-mode-switcher-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', margin: '16px 0', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>Chế độ hiển thị:</span>
        <button
          type="button"
          onClick={() => setViewMode('all')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            background: viewMode === 'all' ? '#2563eb' : '#e2e8f0',
            color: viewMode === 'all' ? '#fff' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Home size={15} />
          Tất cả phòng (Không có bảng điểm)
        </button>

        <button
          type="button"
          onClick={() => setViewMode('single')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            background: viewMode === 'single' ? '#2563eb' : '#e2e8f0',
            color: viewMode === 'single' ? '#fff' : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Eye size={15} />
          Chọn từng phòng (Có bảng điểm chi tiết)
        </button>

        {viewMode === 'single' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Chọn phòng:</span>
            <select
              value={selectedRoomNumber}
              onChange={(e) => setSelectedRoomNumber(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
            >
              {rooms.map(r => (
                <option key={r.roomNumber} value={r.roomNumber}>
                  Phòng {r.roomNumber} ({r.students.length} SV)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="filter-bar-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <div className="filter-label">
          <Filter size={16} color="#2563eb" />
          <span>Lọc theo Giảng viên:</span>
        </div>

        <select
          value={selectedTeacherFilter}
          onChange={(e) => setSelectedTeacherFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">-- Tất cả Giảng viên --</option>
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
            className="btn-clear-filter"
          >
            ✕ Bỏ lọc GV
          </button>
        )}

        <div className="filter-label" style={{ marginLeft: '12px' }}>
          <span>Tìm kiếm (Tên/MSSV):</span>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Nhập tên hoặc MSSV..."
          className="filter-select"
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', minWidth: '200px' }}
        />

        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="btn-clear-filter"
          >
            ✕ Xóa tìm kiếm
          </button>
        )}
      </div>

      <div className="rooms-grid">
        {filteredRooms.length === 0 ? (
          <div className="no-rooms-found">
            Không tìm thấy phòng nào khớp với điều kiện lọc/tìm kiếm của bạn.
          </div>
        ) : (
          filteredRooms.map((room) => {
            const activeRoomStudents = room.students || [];
            const isFull = activeRoomStudents.length >= MAX_PER_ROOM;
            const isEmpty = activeRoomStudents.length === 0;
            const currentLeaderKey = leaders[room.roomNumber];
            const isDropdownOpen = activeDropdownRoom === room.roomNumber;
            const isEditingThisRoom = editingRoomNumber === room.roomNumber;

            return (
              <div
                key={room.roomNumber}
                className={`room-card ${isEmpty ? 'empty' : ''}`}
              >
                <div className="room-card-header">
                  <div className="room-title">
                    <div className="room-icon-wrapper">
                      <Home size={15} color="#3b82f6" />
                    </div>
                    {isEditingThisRoom ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          autoFocus
                          value={newTargetRoomValue}
                          onChange={(e) => setNewTargetRoomValue(e.target.value)}
                          style={{ width: '55px', padding: '2px 4px', fontSize: '13px', borderRadius: '4px', border: '1px solid #3b82f6' }}
                          placeholder="Số mới"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateSingleRoomNumber(room.roomNumber)}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingRoomNumber(null); setNewTargetRoomValue(''); }}
                          style={{ background: '#e2e8f0', color: '#334155', border: 'none', padding: '3px 5px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Phòng {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoomNumber(room.roomNumber);
                              setNewTargetRoomValue(String(room.roomNumber));
                            }}
                            title="Chỉnh sửa số phòng này (đổi cho tất cả thành viên)"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: '#64748b' }}
                          >
                            <Edit3 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="room-card-header-right">
                    {!isEmpty && (
                      <span className={`gender-tag ${room.genderType === 'Nữ' ? 'nu' : 'nam'}`}>
                        {room.genderType}
                      </span>
                    )}

                    {canManage && !isFull && (
                      <button
                        type="button"
                        onClick={() => openAddStudentModalForRoom(room.roomNumber, room.genderType)}
                        title={`Thêm sinh viên vào phòng ${room.roomNumber}`}
                        className="btn-add-mini"
                      >
                        <Plus size={12} />
                        <span>Thêm</span>
                      </button>
                    )}

                    {!isEmpty && canManage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownRoom(isDropdownOpen ? null : room.roomNumber);
                        }}
                        className={`btn-leader-toggle ${currentLeaderKey ? 'has-leader' : ''}`}
                      >
                        {currentLeaderKey ? (
                          <>
                            <Crown size={12} color="#eab308" />
                            <span>TP</span>
                          </>
                        ) : (
                          <>
                            <UserCheck size={12} />
                            <span>TP</span>
                          </>
                        )}
                      </button>
                    )}

                    {isDropdownOpen && !isEmpty && canManage && (
                      <div 
                        className="leader-dropdown-popover"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="leader-dropdown-title">
                          CHỌN TRƯỞNG PHÒNG
                        </div>

                        {currentLeaderKey && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLeader(room.roomNumber)}
                            className="leader-remove-btn"
                          >
                            ✕ Hủy trưởng phòng
                          </button>
                        )}

                        {activeRoomStudents.map((st: any, idx: number) => {
                          if (!st) return null;
                          const studentKey = getStudentCode(st);
                          const isSelected = currentLeaderKey === studentKey;
                          const studentName = st.HoVaTen || st.name;

                          return (
                            <button
                              key={studentKey + '-' + idx}
                              type="button"
                              onClick={() => handleSelectLeader(room.roomNumber, studentKey)}
                              className={`leader-option-item ${isSelected ? 'selected' : ''}`}
                            >
                              <span>
                                {idx + 1}. {studentName}
                              </span>
                              {isSelected && <Crown size={11} color="#eab308" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="room-capacity">
                  <span>Sỉ số: <strong>{activeRoomStudents.length}/{MAX_PER_ROOM}</strong></span>
                  <span className={`status-pill ${isFull ? 'full' : isEmpty ? 'free' : 'available'}`}>
                    {isFull ? 'Đầy' : isEmpty ? 'Trống' : 'Còn chỗ'}
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
                    <div className="empty-text">Chưa có sinh viên trong phòng</div>
                  ) : (
                    activeRoomStudents.map((st: any, idx) => {
                      if (!st) return null;
                      const studentKey = getStudentCode(st);
                      const displayCode = studentKey;
                      const isLeader = currentLeaderKey === studentKey;
                      const studentName = st.HoVaTen || st.name;
                      const studentTeacher = st.ThayCo || st.thayCo || st.HoTen || st.hoTen;
                      
                      const isLate = checkIsLate(st);
                      
                      const isTeacherMatch = selectedTeacherFilter ? studentTeacher === selectedTeacherFilter : true;
                      const query = searchTerm.trim().toLowerCase();
                      const isSearchMatch = query ? (String(studentName || '').toLowerCase().includes(query) || String(displayCode || '').toLowerCase().includes(query)) : true;
                      const isMatched = isTeacherMatch && isSearchMatch;
                      const finalScore = calculateFinalScore(studentKey);

                      return (
                        <div
                          key={studentKey + '-' + idx}
                          className={`student-row-card ${isLeader ? 'is-leader' : ''} ${((selectedTeacherFilter || searchTerm) && isMatched) ? 'matched' : ''}`}
                          style={{
                            opacity: (selectedTeacherFilter || searchTerm) && !isMatched ? 0.35 : 1,
                            border: (searchTerm && isSearchMatch) ? '1px solid #3b82f6' : undefined
                          }}
                        >
                          <div className="student-info-top">
                            <div className="student-name-wrap">
                              <span className="student-name-text">
                                {isLeader && (
                                  <Crown
                                    size={13}
                                    color="#eab308"
                                    style={{ marginRight: 3, verticalAlign: 'middle' }}
                                  />
                                )}
                                {idx + 1}. {studentName} <span className="student-code-muted">({displayCode})</span>
                                
                                {isLate && (
                                  <span style={{ marginLeft: '6px', fontSize: '11px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Trễ
                                  </span>
                                )}
                              </span>
                              {studentTeacher && <span className="student-teacher-muted">GV: {studentTeacher}</span>}
                            </div>

                            <div className="student-actions-right">
                              {viewMode === 'single' && (
                                <span className={`score-badge-pill ${finalScore < 10 ? 'low' : 'good'}`}>
                                  {finalScore}đ
                                </span>
                              )}

                              {canManage && isRoomLocked && (
                                <button
                                  type="button"
                                  onClick={() => setStudentToDelete(st)}
                                  title="Đánh dấu vắng học"
                                  className="btn-mark-absent-mini"
                                >
                                  <UserX size={11} />
                                </button>
                              )}
                            </div>
                          </div>

                          {viewMode === 'single' && (
                            <div className="score-day-scroll-row">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => {
                                const dayViolations = scores[studentKey]?.[day] || [];
                                return (
                                  <div key={day} className="score-day-col">
                                    <span className="day-label-text">T{day}</span>
                                    {dayViolations.map((v, i) => (
                                      <span 
                                        key={i} 
                                        title={`Trừ ${v.penalty}đ (${v.displayCode}). Click để xóa`} 
                                        onClick={() => handleToggleViolation(studentKey, day, v.code, v.displayCode, v.penalty)} 
                                        className="violation-chip"
                                      >
                                        {v.displayCode}
                                      </span>
                                    ))}
                                    {canManage && (
                                      <select 
                                        defaultValue=""
                                        onChange={(e) => handleViolationSelectChange(studentKey, day, e)} 
                                        className="violation-select-mini"
                                      >
                                        <option value="" disabled>+</option>
                                        {violations.map((v) => (
                                          <option key={v.code} value={v.code}>{v.code} (-{v.penalty}đ)</option>
                                        ))}
                                        <option value="ADD_CUSTOM" style={{ fontWeight: 'bold', color: '#2563eb' }}>➕ Thêm lỗi...</option>
                                        <option value="MANAGE_RULES" style={{ fontWeight: 'bold', color: '#4f46e5' }}>⚙️ Quản lý...</option>
                                      </select>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
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

      {isLateModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '580px', width: '90%', background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 className="modal-title-text" style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
                <Clock size={20} color="#d97706" />
                Danh sách sinh viên đi trễ ({lateStudentsList.length} SV)
              </h3>
              <button 
                type="button" 
                onClick={() => setIsLateModalOpen(false)}
                className="modal-close-btn"
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {lateStudentsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '14px' }}>
                  Không có sinh viên nào đi trễ.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>STT</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>MSSV</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Họ và Tên</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Phòng</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Giảng viên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateStudentsList.map(({ student: st, roomNumber }, index) => {
                      const mssv = getStudentCode(st);
                      const name = st.HoVaTen || st.name;
                      const teacher = st.ThayCo || st.thayCo || st.HoTen || st.hoTen || 'Chưa phân công';
                      return (
                        <tr key={mssv + '-' + index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px' }}>{index + 1}</td>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{mssv}</td>
                          <td style={{ padding: '8px' }}>{name}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {roomNumber > 0 ? `Phòng ${roomNumber}` : 'Chưa xếp'}
                            </span>
                          </td>
                          <td style={{ padding: '8px', color: '#64748b' }}>{teacher}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ textAlign: 'right', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => setIsLateModalOpen(false)}
                style={{ backgroundColor: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddStudentOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title-text">
                <UserPlus size={18} color="#2563eb" />
                Thêm sinh viên vào Phòng {targetRoomForAdd}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddStudentOpen(false)}
                className="modal-close-btn"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setAddMethod('absent')}
                style={{
                  flex: 1, padding: '6px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer',
                  background: addMethod === 'absent' ? '#2563eb' : '#f1f5f9',
                  color: addMethod === 'absent' ? '#fff' : '#475569',
                  fontSize: '13px'
                }}
              >
                Chọn từ DS vắng mặt
              </button>
              <button
                type="button"
                onClick={() => setAddMethod('manual')}
                style={{
                  flex: 1, padding: '6px', borderRadius: '6px', border: 'none', fontWeight: 600, cursor: 'pointer',
                  background: addMethod === 'manual' ? '#2563eb' : '#f1f5f9',
                  color: addMethod === 'manual' ? '#fff' : '#475569',
                  fontSize: '13px'
                }}
              >
                Nhập thủ công
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="modal-form">
              {addMethod === 'absent' ? (
                <div>
                  <label className="modal-label">
                    Chọn sinh viên đang vắng mặt:
                  </label>
                  {absentStudentsList.length === 0 ? (
                    <div className="modal-empty-notice">
                      Không có sinh viên nào đang vắng mặt. Bạn có thể chọn tab "Nhập thủ công" phía trên.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedAbsentStudentId}
                      onChange={(e) => setSelectedAbsentStudentId(e.target.value)}
                      className="modal-select-dropdown"
                    >
                      <option value="">-- Chọn sinh viên --</option>
                      {absentStudentsList.map((st: any) => {
                        const sKey = getStudentCode(st);
                        const sName = st.HoVaTen || st.name;
                        const sGender = st.GioiTinh || st.gender || '';
                        return (
                          <option key={sKey} value={sKey}>
                            {sName} ({sKey}) - {sGender}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label className="modal-label">Mã số sinh viên (MSSV):</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: 31215... hoặc B21..."
                      value={manualMssv}
                      onChange={(e) => setManualMssv(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label className="modal-label">Họ và tên sinh viên:</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Văn A"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label className="modal-label">Giới tính:</label>
                      <select
                        value={manualGender}
                        onChange={(e) => setManualGender(e.target.value as 'Nam' | 'Nữ')}
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="modal-label">Giảng viên quản lý:</label>
                      <input
                        type="text"
                        placeholder="VD: Thầy Nam"
                        value={manualTeacher}
                        onChange={(e) => setManualTeacher(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-tip-box" style={{ marginTop: '10px' }}>
                Hệ thống sẽ cập nhật, xếp sinh viên vào Phòng {targetRoomForAdd} và tự động đánh dấu đi trễ.
              </div>

              <div className="modal-footer-btns" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  disabled={isSubmittingAdd}
                  className="modal-btn-cancel"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd || (addMethod === 'absent' && (absentStudentsList.length === 0 || !selectedAbsentStudentId))}
                  className={`modal-btn-submit ${(addMethod === 'absent' && (absentStudentsList.length === 0 || !selectedAbsentStudentId)) ? 'disabled' : ''}`}
                >
                  {isSubmittingAdd ? 'Đang xử lý...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isViolationModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={20} color="#4f46e5" /> Quản lý danh mục lỗi
            </h3>

            <form onSubmit={handleAddRuleFromModal} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ fontSize: '14px', color: '#334155' }}>Thêm / Chỉnh sửa lỗi mới</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Mã (VD: NHẬU)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
                <input
                  type="number"
                  step="0.5"
                  placeholder="Điểm trừ"
                  value={newPenalty}
                  onChange={(e) => setNewPenalty(parseFloat(e.target.value))}
                  required
                  style={{ width: '90px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
              <input
                type="text"
                placeholder="Tên mô tả chi tiết lỗi"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />
              <button type="submit" style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} /> Lưu quy định
              </button>
            </form>

            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Mã</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Mô tả</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Điểm trừ</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v) => (
                    <tr key={v.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{v.code}</td>
                      <td style={{ padding: '8px' }}>{v.label}</td>
                      <td style={{ padding: '8px', color: '#dc2626' }}>-{v.penalty}đ</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {!DEFAULT_VIOLATIONS.some(def => def.code === v.code) && (
                          <button type="button" onClick={() => handleDeleteRule(v.code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Xóa lỗi">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => setIsViolationModalOpen(false)} style={{ backgroundColor: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="modal-overlay">
          <div className="modal-card confirm-modal">
            <div className="confirm-modal-header">
              <div className="confirm-icon-wrap">
                <AlertCircle size={20} />
              </div>
              <h3 className="modal-title-text">Xác nhận vắng học</h3>
            </div>

            <p className="confirm-modal-desc">
              Bạn có chắc chắn muốn đánh dấu sinh viên <strong>{(studentToDelete as any).HoVaTen || studentToDelete.name}</strong> là vắng mặt và đưa ra khỏi phòng không?
            </p>

            <div className="modal-footer-btns">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                disabled={isDeleting}
                className="modal-btn-cancel"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmMarkAbsent}
                disabled={isDeleting}
                className="modal-btn-danger"
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