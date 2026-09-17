import React, { useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
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

  // Danh sách Lớp và danh sách Thầy/Cô
  const classes = Array.from(new Set(students.map((s) => s.className))).filter(Boolean);
  const teachers = Array.from(new Set(students.map((s) => s.thayCo))).filter(Boolean);

  // 🌟 TÍNH TOÁN CÁC MSSV BỊ TRÙNG LẶP
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

  // 🌟 HÀM XỬ LÝ XÓA CÁC BẢN GHI TRÙNG MSSV (CHỈ GIỮ LẠI 1)
  const handleResolveDuplicates = async () => {
    if (!canManage) return;
    try {
      setIsCleaningDuplicates(true);
      
      // Duyệt qua từng nhóm trùng MSSV
      for (const group of duplicateGroups) {
        const itemsToDelete = group.items.slice(1);
        
        for (const _item of itemsToDelete) {
          const { error } = await supabase
            .from('DanhSachSinhVien')
            .delete()
            .eq('MSSV', group.mssv);

          if (error) {
            console.error('Lỗi khi xóa bản ghi trùng MSSV:', error.message);
          }
        }
      }

      alert('Đã dọn dẹp các sinh viên trùng MSSV thành công!');
      setShowDuplicateModal(false);
      if (onRefresh) {
        onRefresh();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Lỗi xử lý trùng lặp:', err);
      alert('Không thể hoàn tất việc xóa trùng: ' + err.message);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  // Lọc sinh viên theo từ khóa, lớp và thầy cô
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

  // 🌟 TÍNH SỐ LƯỢNG HIỆN DIỆN (TỔNG TRỪ VẮNG)
  const presentCount = totalStudents - absentCount;

  // 🌟 XỬ LÝ CLICK CHECKBOX ĐI TRỄ KÈM CẬP NHẬT CSDL SUPABASE CHO CỘT 'late_at'
  const handleLateChange = async (student: Student) => {
    if (!canManage) return;

    const targetId = student.id || student.studentId;
    const nextIsLate = !student.isLate;
    const currentTime = nextIsLate ? new Date().toISOString() : null;
    const diTreVal = nextIsLate ? 'x' : null;

    onToggleAttendance(targetId, 'isLate');

    try {
      const { error } = await supabase
        .from('DanhSachSinhVien')
        .update({
          DiTre: diTreVal,
          late_at: currentTime,
        })
        .eq('MSSV', student.studentId);

      if (error) {
        console.error('Lỗi cập nhật late_at lên Supabase:', error.message);
      }
    } catch (err) {
      console.error('Lỗi kết nối Supabase khi cập nhật trạng thái trễ:', err);
    }
  };

  // 🌟 SAO LƯU DỮ LIỆU SANG 'KhoaHocDaKetThuc' RỒI MỚI XÓA BẢNG 'DanhSachSinhVien'
  const handleConfirmEndCourse = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManage) {
      alert('Bạn không có quyền thực hiện thao tác này!');
      return;
    }

    if (!dot.trim() || !hocKy.trim() || !namHoc.trim()) return;

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

        const { error: insertError } = await supabase
          .from('KhoaHocDaKetThuc')
          .insert(historyPayload);

        if (insertError) throw insertError;
      }

      const { error: deleteError } = await supabase
        .from('DanhSachSinhVien')
        .delete()
        .neq('MSSV', '___NEVER_MATCH___');

      if (deleteError) {
        const { error: deleteAltError } = await supabase
          .from('DanhSachSinhVien')
          .delete()
          .gte('STT', 0);

        if (deleteAltError) throw deleteAltError;
      }

      setIsModalOpen(false);
      setShowSuccessModal(true);

    } catch (err: any) {
      console.error('Lỗi khi sao lưu hoặc xóa dữ liệu:', err);
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

    if (onRefresh) {
      onRefresh();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="manage-students-container">
      {/* HEADER TỔNG QUAN */}
      <div className="manage-header">
        <div>
          <h1 className="manage-title">Quản Lý Điểm Danh & Vi Phạm</h1>
          <p className="manage-subtitle">
            Tích vắng/đi trễ/mượn đồ để cập nhật trực tiếp lên hệ thống
          </p>
        </div>

        {/* THỐNG KÊ & NÚT HÀNH ĐỘNG */}
        <div className="manage-actions">
          <span className="stat-badge total">👥 Tổng: {totalStudents}</span>
          <span className="stat-badge present" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>✅ Hiện diện: {presentCount}</span>
          <span className="stat-badge absent">🙅 Vắng: {absentCount}</span>
          <span className="stat-badge late">⏰ Trễ: {lateCount}</span>
          <span className="stat-badge borrow" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>📦 Mượn đồ: {borrowCount}</span>

          {/* NÚT THÔNG BÁO TRÙNG MSSV (CHỈ HIỆN KHI CÓ TRÙNG) */}
          {duplicateGroups.length > 0 && canManage && (
            <button
              onClick={() => setShowDuplicateModal(true)}
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
            <option key={t || ''} value={t || ''}>
              {t || 'Trống'}
            </option>
          ))}
        </select>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="class-select"
        >
          <option value="all">Tất cả các lớp</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
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
                        onChange={() => handleLateChange(student)}
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

      {/* 🌟 POPUP MODAL XỬ LÝ TRÙNG MSSV */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">⚠️ Phát hiện Sinh viên Trùng MSSV</h3>
                <p className="modal-subtitle">Hệ thống tìm thấy các mã sinh viên xuất hiện nhiều lần trong CSDL.</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="modal-close">✕</button>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', margin: '16px 0', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
              {duplicateGroups.map((group, idx) => (
                <div key={idx} style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <strong>MSSV: {group.mssv}</strong> (Trùng {group.items.length} lần)
                  <ul style={{ margin: '4px 0 0 20px', fontSize: '13px', color: '#475569' }}>
                    {group.items.map((it, i) => (
                      <li key={i}>
                        {it.name} - Lớp: {it.className || 'Trống'} {i === 0 ? '✨ (Sẽ được giữ lại)' : '❌ (Sẽ bị xóa bớt)'}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="btn-cancel"
              >
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
                {isCleaningDuplicates ? 'Đang dọn dẹp...' : 'Xóa bản ghi trùng (Giữ lại 1)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1️⃣ POPUP MODAL NHẬP THÔNG TIN KẾT THÚC KHÓA HỌC */}
      {isModalOpen && canManage && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header-icon">🎓</div>

            <div className="modal-header">
              <div>
                <h3 className="modal-title">Kết Thúc Khóa Học</h3>
                <p className="modal-subtitle">Nhập thông tin khóa học để sao lưu lịch sử và làm sạch dữ liệu hiện tại.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="modal-close">
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmEndCourse} className="modal-form">
              <div className="modal-warning-card">
                <span style={{ fontSize: '18px' }}>🚨</span>
                <div>
                  <strong>Lưu ý:</strong> Dữ liệu sẽ được lưu trữ tự động vào CSDL Lịch sử trước khi xóa danh sách hiện tại.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Đợt <span className="required">*</span>
                </label>
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
                <label className="form-label">
                  Học Kỳ <span className="required">*</span>
                </label>
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
                <label className="form-label">
                  Năm Học <span className="required">*</span>
                </label>
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
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isDeleting}
                  className="btn-cancel"
                >
                  Hủy bỏ
                </button>
                <button type="submit" disabled={isDeleting} className="btn-delete">
                  {isDeleting ? 'Đang lưu & xóa...' : 'Đồng Ý & Kết Thúc'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2️⃣ POPUP MODAL THÔNG BÁO THÀNH CÔNG */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                margin: '0 auto 16px auto'
              }}
            >
              ✓
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>
              Kết Thúc Khóa Học Thành Công!
            </h3>

            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Đã sao lưu thông tin <strong>{dot} - {hocKy} - {namHoc}</strong> vào kho Lịch Sử và làm sạch bảng hiện tại.
            </p>

            <button
              onClick={handleCloseSuccess}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
              }}
            >
              Hoàn tất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManageStudents;