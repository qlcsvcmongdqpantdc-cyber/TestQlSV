import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, Trash2, AlertCircle, Info, Lock, UserCheck } from 'lucide-react';
import type { Student } from '../types/student';
import type { User } from '../types/auth';
import './AddStudent.css';

interface AddStudentProps {
  students: Student[];
  onAddStudents: (newStudents: Student[]) => Promise<void>;
  currentUser: (User & { can_manage?: boolean }) | null;
}

interface Notification {
  type: 'success' | 'error' | 'info';
  message: string;
}

export const AddStudent: React.FC<AddStudentProps> = ({ onAddStudents, currentUser }) => {
  const [parsedStudents, setParsedStudents] = useState<Student[]>([]);
  const [fileName, setFileName] = useState<string>('');
  
  // State lưu tên thầy cô chọn từ danh sách dropdown
  const [thayCo, setThayCo] = useState<string>('');

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  // Kiểm tra quyền quản lý thực tế
  const canManage = currentUser?.role === 'admin' || currentUser?.can_manage === true;

  // Hàm hiển thị thông báo đẹp tự động ẩn sau 4 giây
  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const processExcelFile = (file: File) => {
    if (!canManage) {
      showNotification('error', 'Bạn không có quyền thực hiện thao tác này!');
      return;
    }

    if (!file.name.match(/\.(xlsx|xls|xlsm)$/i)) {
      showNotification('error', 'Vui lòng tải lên file Excel đúng định dạng (.xlsx, .xls, .xlsm)!');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        // Đọc dữ liệu thô dưới dạng mảng 2 chiều
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
        });

        // 1. Tự động tìm dòng bắt đầu chứa chữ MSSV
        let headerRowIdx = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const rowStr = rawRows[i].join(' ').toUpperCase();
          if (rowStr.includes('MSSV')) {
            headerRowIdx = i;
            break;
          }
        }

        const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;
        const dataRows = rawRows.slice(startIdx);

        const mappedData: Student[] = [];

        dataRows.forEach((row) => {
          if (!row || row.length === 0) return;

          // A. Trích xuất MSSV từ dải cột B, C, D (Index 1, 2, 3)
          const mssvCandidates = [row[1], row[2], row[3]]
            .map((c) => String(c).trim())
            .filter(Boolean);
          const mssv = mssvCandidates[0] || '';

          // Nếu dòng này không có MSSV hoặc dính chữ tiêu đề -> Bỏ qua
          if (!mssv || mssv.toUpperCase().includes('MSSV')) return;

          // B. Trích xuất Họ và Tên từ dải cột E đến K (Index 4 đến 10)
          const nameParts = row
            .slice(4, 11)
            .map((c) => String(c).trim())
            .filter(Boolean);
          const fullName = nameParts.join(' ');

          // C. Trích xuất Giới tính từ cột L (Index 11)
          const genderCandidates = [row[11], row[12]]
            .map((c) => String(c).trim())
            .filter(Boolean);
          const rawGender = genderCandidates[0] || 'Nam';
          const gender = rawGender.toLowerCase().includes('nữ') ? 'Nữ' : 'Nam';

          // D. Trích xuất Lớp từ cột M, N (Index 12, 13)
          const classCandidates = row
            .slice(12, 16)
            .map((c) => String(c).trim())
            .filter(Boolean);
          const className = classCandidates[0] || '';

          if (fullName) {
            mappedData.push({
              id: String(mappedData.length + 1),
              studentId: mssv,
              name: fullName,
              gender: gender,
              className: className,
              isAbsent: false,
              isLate: false,
              thayCo: thayCo.trim() || null,
            });
          }
        });

        if (mappedData.length === 0) {
          showNotification('error', 'Không tìm thấy dữ liệu sinh viên hợp lệ trong file này!');
        } else {
          setParsedStudents(mappedData);
          showNotification('success', `Đã nhận diện thành công ${mappedData.length} sinh viên!`);
        }
      } catch (error) {
        console.error('Lỗi đọc Excel:', error);
        showNotification('error', 'Có lỗi xảy ra khi đọc cấu trúc file Excel!');
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Các hàm xử lý kéo thả
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canManage) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canManage) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!canManage) {
      showNotification('error', 'Tài khoản của bạn chưa được cấp phép thêm sinh viên!');
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) {
      showNotification('error', 'Tài khoản của bạn chưa được cấp phép thêm sinh viên!');
      return;
    }
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0]);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!canManage) {
      showNotification('error', 'Bạn không có quyền lưu dữ liệu này!');
      return;
    }
    if (parsedStudents.length === 0) return;
    
    setLoading(true);
    try {
      const studentsWithThayCo = parsedStudents.map(st => ({
        ...st,
        thayCo: thayCo.trim() || null
      }));

      await onAddStudents(studentsWithThayCo);
      showNotification('success', 'Đã lưu danh sách sinh viên vào CSDL thành công!');
      setParsedStudents([]);
      setFileName('');
      setThayCo('');
    } catch (err: any) {
      showNotification('error', 'Lỗi khi lưu vào CSDL: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-student-container" style={{ position: 'relative' }}>
      {/* Toast Notification đẹp mắt */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            background:
              notification.type === 'success'
                ? '#f0fdf4'
                : notification.type === 'error'
                ? '#fef2f2'
                : '#eff6ff',
            border: `1px solid ${
              notification.type === 'success'
                ? '#bbf7d0'
                : notification.type === 'error'
                ? '#fecaca'
                : '#bfdbfe'
            }`,
            color:
              notification.type === 'success'
                ? '#166534'
                : notification.type === 'error'
                ? '#991b1b'
                : '#1e40af',
            animation: 'fadeInOut 0.3s ease-in-out',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          {notification.type === 'success' && <CheckCircle size={20} color="#16a34a" />}
          {notification.type === 'error' && <AlertCircle size={20} color="#dc2626" />}
          {notification.type === 'info' && <Info size={20} color="#2563eb" />}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="page-header">
        <h2>Thêm Sinh Viên Từ File Excel</h2>
        <p>Kéo thả hoặc chọn file Excel danh sách môn học/danh sách lớp</p>
      </div>

      {!canManage ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginTop: '20px'
        }}>
          <Lock size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h3 style={{ color: '#1e293b', marginBottom: '8px' }}>Tài khoản chưa được cấp quyền</h3>
          <p style={{ color: '#64748b' }}>Bạn cần được Quản trị viên tích chọn cấp quyền quản lý để sử dụng chức năng thêm sinh viên.</p>
        </div>
      ) : (
        <>
          <div
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".xlsx, .xls, .xlsm"
              id="excel-file-input"
              onChange={handleFileChange}
              hidden
            />
            <label htmlFor="excel-file-input" className="dropzone-label" style={{ cursor: 'pointer' }}>
              <FileSpreadsheet size={48} className="icon-excel" />
              <div className="dropzone-text">
                <strong>Kéo & thả file Excel vào đây</strong>
                <span>hoặc <u>bấm vào đây</u> để chọn file từ máy tính</span>
              </div>
              <span className="file-hint">Hỗ trợ file: .xlsx, .xls, .xlsm</span>
            </label>
          </div>

          {parsedStudents.length > 0 && (
            <div className="preview-section">
              <div className="preview-header">
                <div className="file-info">
                  <CheckCircle color="#16a34a" size={20} />
                  <span>
                    File: <strong>{fileName}</strong> (Nhận diện thành công <strong>{parsedStudents.length}</strong> sinh viên)
                  </span>
                </div>
                <div className="actions">
                  <button
                    className="btn-cancel"
                    onClick={() => { setParsedStudents([]); setFileName(''); setThayCo(''); }}
                    disabled={loading}
                  >
                    <Trash2 size={16} /> Hủy
                  </button>
                  <button
                    className="btn-save"
                    onClick={handleSaveToDatabase}
                    disabled={loading}
                  >
                    <Upload size={16} /> {loading ? 'Đang lưu...' : 'Lưu Vào Cơ Sở Dữ Liệu'}
                  </button>
                </div>
              </div>

              {/* Ô CHỌN TÊN THẦY CÔ DẠNG DANH SÁCH THẢ (SELECT) */}
              <div style={{
                background: '#f8fafc',
                padding: '14px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                margin: '16px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <UserCheck size={20} color="#2563eb" />
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Chọn Thầy / Cô phụ trách (sẽ áp dụng khi bấm Lưu vào CSDL):
                  </label>
                  <select
                    value={thayCo}
                    onChange={(e) => {
                      const val = e.target.value;
                      setThayCo(val);
                      setParsedStudents(prev => prev.map(item => ({ ...item, thayCo: val.trim() || null })));
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #94a3b8',
                      outline: 'none',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      background: '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Chọn Thầy/Cô phụ trách --</option>
                    <option value="Lâm Văn Vũ">Lâm Văn Vũ</option>
                    <option value="Cao Trần Trí">Cao Trần Trí</option>
                    <option value="Trần Thị Hồng Huệ">Trần Thị Hồng Huệ</option>
                    <option value="Nguyễn Thành Tín">Nguyễn Thành Tín</option>
                  </select>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="excel-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>MSSV</th>
                      <th>Họ và tên</th>
                      <th>Giới tính</th>
                      <th>Lớp</th>
                      <th>Thầy/Cô</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedStudents.map((st, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td><strong className="mssv-text">{st.studentId}</strong></td>
                        <td>{st.name}</td>
                        <td>
                          <span className={`gender-badge ${st.gender === 'Nữ' ? 'female' : 'male'}`}>
                            {st.gender}
                          </span>
                        </td>
                        <td>{st.className}</td>
                        <td><span style={{ color: '#2563eb', fontWeight: '500' }}>{st.thayCo || thayCo || '(Trống)'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};