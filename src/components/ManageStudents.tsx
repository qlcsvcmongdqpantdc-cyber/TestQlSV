import React, { useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx'; // Import thư viện xuất Excel
import type { Student } from '../types/student';
import type { User } from '../types/auth';
import './ManageStudents.css';

interface ManageStudentsProps {
  students: Student[];
  onToggleAttendance: (targetId: string, field: 'isAbsent' | 'isLate' | 'isBorrow') => void;
  onRefresh?: () => void;
  currentUser?: (User & { can_manage?: boolean }) | null;
}

export function ManageStudents({
  students,
  onToggleAttendance,
  onRefresh,
  currentUser,
}: ManageStudentsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedTeacher, setSelectedTeacher] = useState('all');

  // Kiểm tra quyền quản lý
  const canManage = currentUser?.role === 'admin' || currentUser?.can_manage === true;

  // State Modal Nhập thông tin Kết thúc khóa học
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dot, setDot] = useState('');
  const [hocKy, setHocKy] = useState('');
  const [namHoc, setNamHoc] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // State Modal Thông báo thành công
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // State Modal Quản lý sinh viên trùng MSSV
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  
  // State lưu trữ ID các bản ghi trùng muốn xóa
  const [selectedToDelete, setSelectedToDelete] = useState<{ [mssv: string]: Set<string> }>({});

  // Danh sách Lớp và Thầy/Cô
  const classes = Array.from(new Set(students.map((s) => s.className))).filter(Boolean);
  const teachers = Array.from(new Set(students.map((s) => s.thayCo))).filter(Boolean);

  // Tính toán các MSSV bị trùng lặp
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Student[]>();
    students.forEach((s) => {
      const mssv = String(s.studentId || (s as any).MSSV || '').trim();
      if (!mssv) return;
      if (!map.has(mssv)) {
        map.set(mssv, []);
      }
      map.get(mssv)!.push(s);
    });

    const duplicates: { mssv: string; items: Student[] }[] = [];
    map.forEach((items, mssv) => {
      if (items.length > 1) {
        duplicates.push({ mssv, items });
      }
    });
    return duplicates;
  }, [students]);

  const handleOpenDuplicateModal = () => {
    const initialSelection: { [mssv: string]: Set<string> } = {};
    duplicateGroups.forEach((group) => {
      const deleteSet = new Set<string>();
      group.items.slice(1).forEach((item, idx) => {
        const uniqueKey = item.id || `${group.mssv}_${idx + 1}`;
        deleteSet.add(uniqueKey);
      });
      initialSelection[group.mssv] = deleteSet;
    });
    setSelectedToDelete(initialSelection);
    setShowDuplicateModal(true);
  };

  const handleToggleDeleteTarget = (mssv: string, uniqueKey: string) => {
    setSelectedToDelete((prev) => {
      const currentSet = new Set(prev[mssv] || []);
      if (currentSet.has(uniqueKey)) {
        currentSet.delete(uniqueKey);
      } else {
        currentSet.add(uniqueKey);
      }
      return { ...prev, [mssv]: currentSet };
    });
  };

  const handleResolveDuplicates = async () => {
    if (!canManage) return;
    try {
      setIsCleaningDuplicates(true);
      
      for (const group of duplicateGroups) {
        const deleteSet = selectedToDelete[group.mssv] || new Set();
        
        for (let i = 0; i < group.items.length; i++) {
          const item = group.items[i];
          const uniqueKey = item.id || `${group.mssv}_${i + 1}`;
          if (deleteSet.has(uniqueKey)) {
            let query = supabase.from('DanhSachSinhVien').delete();
            if (item.id) {
              query = query.eq('id', item.id);
            } else {
              query = query.eq('MSSV', group.mssv).eq('HoVaTen', item.name);
            }
            const { error } = await query;
            if (error) {
              console.error('Lỗi khi xóa bản ghi trùng MSSV:', error.message);
            }
          }
        }
      }

      alert('Đã dọn dẹp các sinh viên trùng MSSV thành công!');
      setShowDuplicateModal(false);
      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (err: any) {
      console.error('Lỗi xử lý trùng lặp:', err);
      alert('Không thể hoàn tất việc xóa trùng: ' + err.message);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  // 🌟 HÀM XUẤT FILE EXCEL ĐẸP MẮT
  const exportToExcel = (data: any[], fileName: string) => {
    if (!data || data.length === 0) return;

    // Chuyển đổi key dữ liệu sang tiêu đề tiếng Việt thân thiện hơn cho file Excel
    const formattedData = data.map((item, index) => ({
      'STT': index + 1,
      'Mã Khóa Học': item.MaKhóaHoc || '',
      'Đợt': item.Dot || '',
      'Học Kỳ': item.HocKy || '',
      'Năm Học': item.NamHoc || '',
      'MSSV': item.MSSV || '',
      'Họ và Tên': item.HoVaTen || '',
      'Giới Tính': item.GioiTinh || '',
      'Lớp': item.Lop || '',
      'Phòng': item.Phong || '',
      'Vắng': item.Vang || '',
      'Đi Trễ': item.DiTre || '',
      'Mượn Đồ': item.MuonDo || '',
      'Trưởng Phòng': item.TruongPhong || ''
    }));

    // Tạo worksheet và workbook
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachTongHop');

    // Tự động căn chỉnh độ rộng các cột cho dễ đọc
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 18 }, // Mã Khóa Học
      { wch: 10 }, // Đợt
      { wch: 10 }, // Học Kỳ
      { wch: 15 }, // Năm Học
      { wch: 12 }, // MSSV
      { wch: 25 }, // Họ và Tên
      { wch: 10 }, // Giới Tính
      { wch: 15 }, // Lớp
      { wch: 12 }, // Phòng
      { wch: 8 },  // Vắng
      { wch: 8 },  // Đi Trễ
      { wch: 10 }, // Mượn Đồ
      { wch: 15 }, // Trưởng Phòng
    ];
    worksheet['!cols'] = colWidths;

    // Xuất file Excel về máy người dùng
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  const filteredStudents = students.filter((student) => {
    const matchSearch =
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchClass = selectedClass === 'all' || student.className === selectedClass;
    const matchTeacher = selectedTeacher === 'all' || student.thayCo === selectedTeacher;
    return matchSearch && matchClass && matchTeacher;
  });

  const totalStudents = students.length;
  const absentCount = students.filter((s) => s.isAbsent).length;
  const lateCount = students.filter((s) => s.isLate).length;
  const borrowCount = students.filter((s: any) => s.isBorrow).length;
  const presentCount = totalStudents - absentCount;

  const handleConfirmEndCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !dot.trim() || !hocKy.trim() || !namHoc.trim()) return;

    try {
      setIsDeleting(true);
      const { data: currentDbStudents, error: fetchError } = await supabase
        .from('DanhSachSinhVien')
        .select('*');

      if (fetchError) throw fetchError;

      if (currentDbStudents && currentDbStudents.length > 0) {
        const maKhoaHoc = `${dot.trim().replace(/\s+/g, '')}_${hocKy.trim().replace(/\s+/g, '')}_${namHoc.trim().replace(/\s+/g, '')}`;
        const historyPayload = currentDbStudents.map((s) => ({
          MaKhóaHoc: maKhoaHoc,
          Dot: dot.trim(),
          HocKy: hocKy.trim(),
          NamHoc: namHoc.trim(),
          MSSV: s.MSSV || s.MSV || s.studentId || '',
          HoVaTen: s.HoVaTen || s.Ten || s.name || '',
          GioiTinh: s.GioiTinh || s.gender || 'Nam',
          Lop: s.Lop || s.className || '',
          Phong: s.Phong || s.TenPhong || s.room || null,
          Vang: s.Vang ? String(s.Vang) : null,
          DiTre: s.DiTre ? String(s.DiTre) : null,
          MuonDo: s.MuonDo ? String(s.MuonDo) : null,
          TruongPhong: s.TruongPhong ? String(s.TruongPhong) : null,
        }));

        // 🌟 TỰ ĐỘNG XUẤT FILE EXCEL CHO NGƯỜI DÙNG NGAY KHI KẾT THÚC
        const excelFileName = `TongHop_${dot.trim()}_${hocKy.trim()}_${namHoc.trim().replace(/\s+/g, '_')}`;
        exportToExcel(historyPayload, excelFileName);

        // Lưu vào bảng lịch sử trên Supabase
        const { error: insertError } = await supabase
          .from('KhoaHocDaKetThuc')
          .insert(historyPayload);

        if (insertError) throw insertError;
      }

      // Xóa dữ liệu hiện tại trên Database
      const { error: deleteError } = await supabase
        .from('DanhSachSinhVien')
        .delete()
        .neq('MSSV', '___NEVER_MATCH___');

      if (deleteError) {
        await supabase.from('DanhSachSinhVien').delete().gte('STT', 0);
      }

      setIsModalOpen(false);
      setShowSuccessModal(true);
    } catch (err: any) {
      alert('❌ Lỗi thao tác Supabase: ' + (err.message || 'Không thể hoàn tất thao tác.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessModal(false);
    setDot('');
    setHocKy('');
    setNamHoc('');
    if (onRefresh) onRefresh();
    else window.location.reload();
  };

  return (
    <div className="manage-students-container">
      <div className="manage-header">
        <div>
          <h1 className="manage-title">Quản Lý Điểm Danh & Vi Phạm</h1>
          <p className="manage-subtitle">Tích vắng/đi trễ/mượn đồ để cập nhật trực tiếp lên hệ thống</p>
        </div>

        <div className="manage-actions">
          <span className="stat-badge total">👥 Tổng: {totalStudents}</span>
          <span className="stat-badge present" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>✅ Hiện diện: {presentCount}</span>
          <span className="stat-badge absent">🙅 Vắng: {absentCount}</span>
          <span className="stat-badge late">⏰ Trễ: {lateCount}</span>
          <span className="stat-badge borrow" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>📦 Mượn đồ: {borrowCount}</span>

          {duplicateGroups.length > 0 && canManage && (
            <button
              onClick={handleOpenDuplicateModal}
              style={{
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ⚠️ Trùng MSSV ({duplicateGroups.length})
            </button>
          )}

          {canManage && (
            <button onClick={() => setIsModalOpen(true)} className="btn-end-course">
              <span>🎓</span> Kết thúc khóa học
            </button>
          )}
        </div>
      </div>

      {/* THANH TÌM KIẾM & LỌC */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="🔍 Tìm MSSV hoặc Họ tên..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />

        <select
          value={selectedTeacher}
          onChange={(e) => setSelectedTeacher(e.target.value)}
          className="class-select"
        >
          <option value="all">Tất cả giáo viên</option>
          {teachers.map((t) => (
            <option key={t || ''} value={t || ''}>{t || 'Trống'}</option>
          ))}
        </select>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="class-select"
        >
          <option value="all">Tất cả các lớp</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* BẢNG DANH SÁCH SINH VIÊN */}
      <div className="table-card">
        <table className="student-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>MÃ SV</th>
              <th>HỌ VÀ TÊN</th>
              <th>GIỚI TÍNH</th>
              <th>LỚP</th>
              <th>THÀY/CÔ</th>
              <th className="text-center">TÍCH VẮNG</th>
              <th className="text-center">TÍCH ĐI TRỄ</th>
              <th className="text-center">MƯỢN ĐỒ</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center" style={{ padding: '32px', color: '#94a3b8' }}>
                  Không tìm thấy sinh viên nào trong danh sách.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, index) => {
                const sAny = student as any;
                return (
                  <tr key={student.id || student.studentId}>
                    <td className="stt-col">{index + 1}</td>
                    <td className="mssv-col">{student.studentId}</td>
                    <td className="name-col">{student.name}</td>
                    <td>
                      <span className={`gender-tag ${student.gender === 'Nữ' ? 'female' : 'male'}`}>
                        {student.gender}
                      </span>
                    </td>
                    <td className="class-col">{student.className}</td>
                    <td className="teacher-col" style={{ color: '#2563eb', fontWeight: 500 }}>{student.thayCo || '(Trống)'}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={student.isAbsent || false}
                        disabled={!canManage}
                        onChange={() => canManage && onToggleAttendance(student.id || student.studentId, 'isAbsent')}
                        className="checkbox-absent"
                        style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={student.isLate || false}
                        disabled={!canManage}
                        onChange={() => canManage && onToggleAttendance(student.id || student.studentId, 'isLate')}
                        className="checkbox-late"
                        style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={sAny.isBorrow || false}
                        disabled={!canManage}
                        onChange={() => canManage && onToggleAttendance(student.id || student.studentId, 'isBorrow')}
                        className="checkbox-borrow"
                        style={{ cursor: canManage ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* POPUP MODAL XỬ LÝ TRÙNG MSSV */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '650px', width: '90%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">⚠️ Tùy Chọn Xóa Sinh Viên Trùng MSSV</h3>
                <p className="modal-subtitle">Tích chọn dòng bạn muốn <b>xóa bỏ</b> cho mỗi mã sinh viên bị trùng.</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="modal-close">✕</button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', margin: '16px 0', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
              {duplicateGroups.map((group, idx) => {
                const deleteSet = selectedToDelete[group.mssv] || new Set();
                return (
                  <div key={idx} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '6px' }}>
                      MSSV: {group.mssv} <span style={{ fontSize: '12px', color: '#64748b' }}>(Trùng {group.items.length} lần)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '8px' }}>
                      {group.items.map((it, i) => {
                        const uniqueKey = it.id || `${group.mssv}_${i + 1}`;
                        const isMarkedForDelete = deleteSet.has(uniqueKey);
                        return (
                          <label
                            key={uniqueKey}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              backgroundColor: isMarkedForDelete ? '#fef2f2' : '#f8fafc',
                              border: `1px solid ${isMarkedForDelete ? '#fca5a5' : '#e2e8f0'}`,
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                checked={isMarkedForDelete}
                                onChange={() => handleToggleDeleteTarget(group.mssv, uniqueKey)}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                              <span>
                                <b>{it.name}</b> — Lớp: {it.className || 'Trống'}
                              </span>
                            </div>
                            <span style={{ fontWeight: 600, color: isMarkedForDelete ? '#dc2626' : '#16a34a' }}>
                              {isMarkedForDelete ? '❌ Sẽ xóa' : '✨ Giữ lại'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={() => setShowDuplicateModal(false)} className="btn-cancel">
                Đóng
              </button>
              <button
                type="button"
                disabled={isCleaningDuplicates}
                onClick={handleResolveDuplicates}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {isCleaningDuplicates ? 'Đang xóa...' : 'Xác nhận xóa các dòng đã chọn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KẾT THÚC KHÓA HỌC */}
      {isModalOpen && canManage && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header-icon">🎓</div>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Kết Thúc Khóa Học</h3>
                <p className="modal-subtitle">Nhập thông tin khóa học để sao lưu lịch sử, tải file Excel và làm sạch dữ liệu hiện tại.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="modal-close">✕</button>
            </div>

            <form onSubmit={handleConfirmEndCourse} className="modal-form">
              <div className="modal-warning-card">
                <span style={{ fontSize: '18px' }}>🚨</span>
                <div><strong>Lưu ý:</strong> Hệ thống sẽ tự động tải file Excel tổng hợp về máy và lưu trữ vào CSDL Lịch sử trước khi xóa danh sách hiện tại.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Đợt <span className="required">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đợt 1, Đợt 2..."
                  value={dot}
                  onChange={(e) => setDot(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Học Kỳ <span className="required">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: HK1, HK2..."
                  value={hocKy}
                  onChange={(e) => setHocKy(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Năm Học <span className="required">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: 2025 - 2026..."
                  value={namHoc}
                  onChange={(e) => setNamHoc(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setIsModalOpen(false)} disabled={isDeleting} className="btn-cancel">
                  Hủy bỏ
                </button>
                <button type="submit" disabled={isDeleting} className="btn-delete">
                  {isDeleting ? 'Đang xuất file & xử lý...' : 'Đồng Ý & Xuất Excel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL THÔNG BÁO THÀNH CÔNG */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 16px auto' }}>
              ✓
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>
              Kết Thúc Khóa Học Thành Công!
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Đã tải file Excel, sao lưu thông tin <strong>{dot} - {hocKy} - {namHoc}</strong> vào kho Lịch Sử và làm sạch bảng hiện tại.
            </p>
            <button onClick={handleCloseSuccess} style={{ width: '100%', padding: '12px', backgroundColor: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)' }}>
              Hoàn tất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManageStudents;