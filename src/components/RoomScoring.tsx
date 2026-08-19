import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, Search, ShieldAlert, RefreshCw, FileSpreadsheet, Settings, Trash2, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import type { Student } from '../types/student';
import type { User } from '../types/auth';
import './RoomScoring.css';

type ScoringStudent = Student & { room?: string; roomName?: string; gender?: string; isAbsent?: boolean; isLate?: boolean; thayCo?: string; ThayCo?: string; teacher?: string; Phong?: string };

const DEFAULT_VIOLATIONS = [
  { code: 'V', displayCode: 'V', label: '1. Điểm danh: Không phép (V)', penalty: 2 },
  { code: 'P_DD', displayCode: 'P', label: '1. Điểm danh: Có phép (P)', penalty: 1 },
  { code: 'K', displayCode: 'K', label: '2. Thể dục: Không phép (K)', penalty: 2 },
  { code: 'P_TD', displayCode: 'P', label: '2. Thể dục: Có phép (P)', penalty: 1 },
  { code: 'D', displayCode: 'D', label: '3. Gác đêm: Không phép (D)', penalty: 2 },
  { code: 'P_GD', displayCode: 'P', label: '3. Gác đêm: Có phép (P)', penalty: 1 },
  { code: 'N', displayCode: 'N', label: '4. Nội vụ: Không sắp xếp (N)', penalty: 1 },
];

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

interface RoomScoringProps {
  students: Student[];
  currentUser?: (User & { can_manage?: boolean }) | null;
}

export const RoomScoring: React.FC<RoomScoringProps> = ({ students = [], currentUser }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('Tất cả');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('Tất cả');
  const [scores, setScores] = useState<ScoringMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [violations, setViolations] = useState<ViolationRule[]>(DEFAULT_VIOLATIONS);
  const [isViolationModalOpen, setIsViolationModalOpen] = useState<boolean>(false);

  const [newCode, setNewCode] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newPenalty, setNewPenalty] = useState<number>(1);

  const canManage = currentUser?.role === 'admin' || currentUser?.can_manage === true;

  // --- LẤY TRỰC TIẾP TỪ CỘT 'Phong' VÀ 'ThayCo' CỦA BẢNG DanhSachSinhVien ---
  const processedStudents = useMemo<ScoringStudent[]>(() => {
    if (!students || students.length === 0) return [];

    const activeStudents = (students as ScoringStudent[]).filter((s) => !s.isAbsent);

    return activeStudents.map((st) => ({
      ...st,
      room: (st.Phong ?? st.roomName ?? st.room ?? 'Chưa phân phòng').toString().trim(),
      thayCo: (st.ThayCo ?? st.thayCo ?? st.teacher ?? 'Chưa phân công').toString().trim(),
    }));
  }, [students]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let currentViolations = [...DEFAULT_VIOLATIONS];
        const { data: ruleData, error: ruleError } = await supabase.from('ViolationRules').select('*');
        if (!ruleError && ruleData && ruleData.length > 0) {
          const customRules = ruleData.map((r: any) => ({
            code: r.Code,
            displayCode: r.DisplayCode || r.Code,
            label: r.Label || `Lỗi: ${r.Code}`,
            penalty: Number(r.Penalty) || 1,
          }));
          const mapRules = new Map();
          DEFAULT_VIOLATIONS.forEach(v => mapRules.set(v.code, v));
          customRules.forEach(v => mapRules.set(v.code, v));
          currentViolations = Array.from(mapRules.values());
          setViolations(currentViolations);
        }

        const { data, error } = await supabase.from('ChamDiem').select('*');
        if (error) {
          console.error('Lỗi lấy dữ liệu chấm điểm:', error);
          return;
        }

        if (data && data.length > 0) {
          const loadedScores: ScoringMap = {};
          const loadedNotes: Record<string, string> = {};

          data.forEach((row: any) => {
            const msv = String(row.MSV);
            loadedNotes[msv] = row.GhiChu || '';
            loadedScores[msv] = {};

            for (let day = 1; day <= 10; day++) {
              const dayValue = row[String(day)];
              if (dayValue) {
                const codes = String(dayValue).split(',');
                const dayEntries: RecordEntry[] = [];
                codes.forEach((c) => {
                  const trimmedCode = c.trim();
                  const target = currentViolations.find((v) => v.code === trimmedCode || v.displayCode === trimmedCode);
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
        console.error('Lỗi kết nối:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const calculateFinalScore = (studentKey: string) => {
    const studentData = scores[studentKey];
    if (!studentData) return 10;
    let totalPenalty = 0;
    Object.values(studentData).forEach((dayData) => {
      dayData.forEach((item) => { totalPenalty += item.penalty; });
    });
    return Math.max(0, 10 - totalPenalty);
  };

  const saveToSupabase = async (msv: string, hoVaTen: string, updatedScoresForStudent: Record<number, RecordEntry[]>, noteValue: string) => {
    if (!canManage) return;

    const finalScore = (() => {
      let penalty = 0;
      Object.values(updatedScoresForStudent || {}).forEach((dayData) => {
        dayData.forEach((item) => { penalty += item.penalty; });
      });
      return Math.max(0, 10 - penalty);
    })();

    const recordPayload: Record<string, any> = {
      MSV: msv,
      HoVaTen: hoVaTen,
      DiemNeNep: finalScore,
      GhiChu: noteValue || '',
    };

    for (let day = 1; day <= 10; day++) {
      const dayViolations = updatedScoresForStudent[day] || [];
      recordPayload[String(day)] = dayViolations.map((v) => v.displayCode).join(',') || null;
    }

    await supabase.from('ChamDiem').upsert(recordPayload, { onConflict: 'MSV' });
  };

  const handleToggleViolation = (student: ScoringStudent, day: number, code: string, displayCode: string, penalty: number) => {
    if (!canManage) {
      alert('Bạn không có quyền thay đổi điểm nề nếp!');
      return;
    }

    const studentKey = String(student.studentId || student.id);
    setScores((prev) => {
      const studentData = prev[studentKey] || {};
      const dayData = studentData[day] || [];
      const exists = dayData.some((item) => item.code === code);
      const updatedDayData = exists ? dayData.filter((item) => item.code !== code) : [...dayData, { code, displayCode, penalty }];
      const updatedStudentScores = { ...studentData, [day]: updatedDayData };

      saveToSupabase(studentKey, student.name, updatedStudentScores, notes[studentKey] || '');
      return { ...prev, [studentKey]: updatedStudentScores };
    });
  };

  const handleNoteBlur = (student: ScoringStudent, newNote: string) => {
    if (!canManage) return;
    const studentKey = String(student.studentId || student.id);
    setNotes((prev) => ({ ...prev, [studentKey]: newNote }));
    saveToSupabase(studentKey, student.name, scores[studentKey] || '', newNote);
  };

  const handleSelectChange = (student: ScoringStudent, day: number, selectedValue: string, eventTarget: HTMLSelectElement) => {
    if (!canManage) {
      alert('Bạn không có quyền thực hiện thao tác này!');
      eventTarget.value = '';
      return;
    }

    if (!selectedValue) return;

    if (selectedValue === 'MANAGE_RULES') {
      setIsViolationModalOpen(true);
    } else if (selectedValue === 'ADD_CUSTOM') {
      const codeInput = prompt('Nhập mã/ký tự lỗi tự chọn (VD: OT, VSTH...):');
      if (!codeInput || !codeInput.trim()) {
        eventTarget.value = '';
        return;
      }
      const penaltyInput = prompt(`Nhập số điểm trừ cho lỗi [${codeInput.trim().toUpperCase()}]:`, '1');
      const penalty = parseFloat(penaltyInput || '1');
      if (isNaN(penalty) || penalty <= 0) {
        alert('Số điểm trừ không hợp lệ!');
        eventTarget.value = '';
        return;
      }

      const formattedCode = codeInput.trim().toUpperCase();
      const newRule = {
        code: formattedCode,
        displayCode: formattedCode,
        label: `Tự chọn: ${formattedCode}`,
        penalty: penalty,
      };

      supabase.from('ViolationRules').upsert({
        Code: newRule.code,
        DisplayCode: newRule.displayCode,
        Label: newRule.label,
        Penalty: newRule.penalty,
      }, { onConflict: 'Code' }).then(() => {});

      if (!violations.some((v) => v.code === newRule.code)) {
        setViolations((prev) => [...prev, newRule]);
      }

      handleToggleViolation(student, day, newRule.code, newRule.displayCode, newRule.penalty);
    } else {
      const target = violations.find((v) => v.code === selectedValue);
      if (target) {
        handleToggleViolation(student, day, target.code, target.displayCode, target.penalty);
      }
    }
    eventTarget.value = '';
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
      alert('Lỗi khi lưu danh mục lên cơ sở dữ liệu!');
      return;
    }

    setViolations((prev) => {
      const filtered = prev.filter(v => v.code !== rule.code);
      return [...filtered, rule];
    });

    setNewCode('');
    setNewLabel('');
    setNewPenalty(1);
    alert('Thêm / Cập nhật quy định lỗi thành công!');
  };

  const handleDeleteRule = async (codeToDelete: string) => {
    if (DEFAULT_VIOLATIONS.some(v => v.code === codeToDelete)) {
      alert('Không thể xóa các lỗi mặc định hệ thống!');
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa quy định lỗi [${codeToDelete}] không?`)) {
      await supabase.from('ViolationRules').delete().eq('Code', codeToDelete);
      setViolations(prev => prev.filter(v => v.code !== codeToDelete));
    }
  };

  // --- DANH SÁCH PHÒNG ĐỂ LỌC ---
  const roomList = useMemo(() => {
    const rooms = new Set<string>();
    processedStudents.forEach((s) => {
      if (s.room) rooms.add(s.room);
    });
    return ['Tất cả', ...Array.from(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))];
  }, [processedStudents]);

  // --- DANH SÁCH THẦY CÔ ĐỂ LỌC ---
  const teacherList = useMemo(() => {
    const teachers = new Set<string>();
    processedStudents.forEach((s) => {
      const teacherName = (s.thayCo || '').trim();
      if (teacherName) teachers.add(teacherName);
    });
    return ['Tất cả', ...Array.from(teachers).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  }, [processedStudents]);

  // --- LỌC SINH VIÊN THEO CẢ PHÒNG, THẦY CÔ VÀ TỪ KHÓA ---
  const filteredStudents = useMemo(() => {
    return processedStudents.filter((s) => {
      const roomMatch = selectedRoom === 'Tất cả' || s.room === selectedRoom;
      const teacherName = (s.thayCo || '').trim();
      const teacherMatch = selectedTeacher === 'Tất cả' || teacherName === selectedTeacher;
      
      const search = searchTerm.toLowerCase().trim();
      const searchMatch = !search || s.name.toLowerCase().includes(search) || (s.studentId && s.studentId.toLowerCase().includes(search));
      
      return roomMatch && teacherMatch && searchMatch;
    });
  }, [processedStudents, selectedRoom, selectedTeacher, searchTerm]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (processedStudents.length === 0) {
      alert('Không có dữ liệu sinh viên để xuất Excel!');
      return;
    }

    const allStudentsData = processedStudents.map((st, idx) => {
      const studentKey = String(st.studentId || st.id || idx);
      const finalScore = calculateFinalScore(studentKey);
      const studentScores = scores[studentKey] || {};

      const row: Record<string, any> = {
        'STT': idx + 1,
        'MSV': st.studentId || st.id || '',
        'Họ và Tên': st.name || '',
        'Phòng': st.room || '',
        'Giảng viên': st.thayCo || '',
        'Điểm Nề Nếp': finalScore,
      };

      for (let day = 1; day <= 10; day++) {
        row[`Ngày ${day}`] = (studentScores[day] || []).map((e) => e.displayCode).join(', ');
      }
      row['Ghi chú'] = notes[studentKey] || '';
      return row;
    });

    const wsAll = XLSX.utils.json_to_sheet(allStudentsData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'Tat_Ca');

    XLSX.writeFile(wb, `Cham_Diem_Ne_Nep_KTX_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="scoring-container">
      <div className="scoring-header">
        <div className="header-title-wrapper">
          <h2>
            <ClipboardCheck color="#2563eb" size={24} /> Chấm Điểm Nề Nếp KTX
            {loading && <RefreshCw size={16} className="animate-spin" color="#2563eb" />}
          </h2>
          <p>Điểm khởi tạo ban đầu: 10 điểm</p>
        </div>

        <div className="header-actions">
          {canManage && (
            <>
              <button onClick={() => setIsViolationModalOpen(true)} className="btn-export" style={{ backgroundColor: '#4f46e5', color: '#fff' }} title="Quản lý danh mục quy định lỗi">
                <Settings size={16} /> Quản lý danh mục lỗi
              </button>
              <button onClick={handleExportExcel} className="btn-export" title="Xuất file Excel">
                <FileSpreadsheet size={16} /> Xuất Excel
              </button>
            </>
          )}

          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Tìm tên / MSV..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
      </div>

      {/* BỘ LỌC CHỌN PHÒNG VÀ GIẢNG VIÊN */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {/* Tab Phòng */}
        <div className="room-tabs-container" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ alignSelf: 'center', fontWeight: 'bold', fontSize: '13px', color: '#475569', marginRight: '4px' }}>Phòng:</span>
          {roomList.map((roomName) => {
            const isActive = selectedRoom === roomName;
            return (
              <button
                key={roomName}
                onClick={() => setSelectedRoom(roomName)}
                className={`room-tab-btn ${isActive ? 'active' : ''}`}
              >
                🏠 {roomName}
              </button>
            );
          })}
        </div>

        {/* Tab Giảng viên */}
        {teacherList.length > 1 && (
          <div className="room-tabs-container" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ alignSelf: 'center', fontWeight: 'bold', fontSize: '13px', color: '#475569', marginRight: '4px' }}>Giảng viên:</span>
            {teacherList.map((teacherName) => {
              const isActive = selectedTeacher === teacherName;
              return (
                <button
                  key={teacherName}
                  onClick={() => setSelectedTeacher(teacherName)}
                  className={`room-tab-btn ${isActive ? 'active' : ''}`}
                >
                  👤 {teacherName || 'Chưa phân công'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="main-layout">
        <div className="table-card">
          <div className="table-responsive-wrapper">
            <table className="scoring-table">
              <thead>
                <tr>
                  <th className="col-stt">STT</th>
                  <th className="col-msv">MSV</th>
                  <th className="col-name">HỌ VÀ TÊN</th>
                  <th className="col-room">Phòng</th>
                  <th className="col-room">Giảng viên</th>
                  <th className="th-score">Điểm nề nếp</th>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => (
                    <th key={day} className="col-day">{day}</th>
                  ))}
                  <th className="col-note">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={17} style={{ padding: '24px', color: '#94a3b8' }}>
                      Không có sinh viên nào phù hợp với bộ lọc
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st, idx) => {
                    const studentKey = String(st.studentId || st.id || idx);
                    const finalScore = calculateFinalScore(studentKey);

                    return (
                      <tr key={`${studentKey}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td className="col-msv">{st.studentId || st.id}</td>
                        <td className="col-name">{st.name}</td>
                        <td className="col-room">{st.room}</td>
                        <td className="col-room">{st.thayCo || ''}</td>

                        <td className={`col-total-score ${finalScore < 10 ? 'score-bad' : 'score-good'}`}>
                          {finalScore}
                        </td>

                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((day) => {
                          const dayViolations = scores[studentKey]?.[day] || [];
                          return (
                            <td key={day} style={{ padding: '2px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                                {dayViolations.map((v, i) => (
                                  <span
                                    key={i}
                                    title={canManage ? `Trừ ${v.penalty} điểm. Click để xóa` : ''}
                                    className="violation-tag"
                                    onClick={() => canManage && handleToggleViolation(st, day, v.code, v.displayCode, v.penalty)}
                                    style={{ cursor: canManage ? 'pointer' : 'default' }}
                                  >
                                    {v.displayCode}
                                  </span>
                                ))}

                                {canManage && (
                                  <select
                                    onChange={(e) => handleSelectChange(st, day, e.target.value, e.target)}
                                    className="violation-select"
                                  >
                                    <option value="">+</option>
                                    {violations.map((v) => (
                                      <option key={v.code} value={v.code}>
                                        {v.code} (-{v.penalty}đ)
                                      </option>
                                    ))}
                                    <option value="ADD_CUSTOM" style={{ fontWeight: 'bold', color: '#2563eb' }}>
                                      ➕ Thêm lỗi...
                                    </option>
                                    <option value="MANAGE_RULES" style={{ fontWeight: 'bold', color: '#4f46e5' }}>
                                      ⚙️ Quản lý danh mục...
                                    </option>
                                  </select>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        <td>
                          <input
                            type="text"
                            defaultValue={notes[studentKey] || ''}
                            onBlur={(e) => canManage && handleNoteBlur(st, e.target.value)}
                            disabled={!canManage}
                            placeholder="..."
                            className="note-input"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rules-card">
          <h3 className="rules-title">
            <ShieldAlert size={18} color="#dc2626" /> Quy Định Trừ Điểm
          </h3>
          <div className="rules-content">
            <div className="rule-group">
              <strong>1. Điểm danh</strong>
              <div>• Không phép (<b>V</b>): -2 điểm<br />• Có phép (<b>P</b>): -1 điểm</div>
            </div>
            <div className="rule-group">
              <strong>2. Thể dục</strong>
              <div>• Không phép (<b>K</b>): -2 điểm<br />• Có phép (<b>P</b>): -1 điểm</div>
            </div>
            <div className="rule-group">
              <strong>3. Gác đêm</strong>
              <div>• Không phép (<b>D</b>): -2 điểm<br />• Có phép (<b>P</b>): -1 điểm</div>
            </div>
            <div className="rule-group">
              <strong>4. Nội vụ</strong>
              <div>• Không sắp xếp (<b>N</b>): -1 điểm</div>
            </div>

            {violations.length > DEFAULT_VIOLATIONS.length && (
              <div className="rule-group" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '8px' }}>
                <strong>5. Tiêu chí tự chọn khác</strong>
                {violations.slice(DEFAULT_VIOLATIONS.length).map((v) => (
                  <div key={v.code} style={{ marginTop: '4px' }}>
                    • {v.label} (<b>{v.displayCode}</b>): -{v.penalty} điểm
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL QUẢN LÝ DANH MỤC LỖI */}
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
                  <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Mã</th>
                    <th style={{ padding: '8px' }}>Mô tả</th>
                    <th style={{ padding: '8px' }}>Điểm trừ</th>
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
                          <button onClick={() => handleDeleteRule(v.code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Xóa lỗi">
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
              <button onClick={() => setIsViolationModalOpen(false)} style={{ backgroundColor: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomScoring;