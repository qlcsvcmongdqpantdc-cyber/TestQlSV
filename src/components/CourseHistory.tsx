import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './CourseHistory.css';

interface HistoryRecord {
  id: number;
  MaKhoaHoc: string;
  Dot: string;
  HocKy: string;
  NamHoc: string;
  MSSV: string;
  HoVaTen: string;
  GioiTinh: string;
  Lop: string;
  Phong: string;
  Vang: string;
  DiTre: string;
  GhiChu: string;
}

interface CourseOption {
  key: string;
  label: string;
}

interface CourseHistoryProps {
  selectedCourseKey?: string | null;
}

export function CourseHistory({ selectedCourseKey: propCourseKey }: CourseHistoryProps) {
  const [data, setData] = useState<HistoryRecord[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string>(''); 
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Tải danh sách các khóa học để hiển thị trên Dropdown
  useEffect(() => {
    const fetchCoursesList = async () => {
      setLoadingCourses(true);
      const { data: result, error } = await supabase
        .from('KhoaHocDaKetThuc')
        .select('*');

      if (error) {
        console.error('Lỗi tải danh sách khóa học:', error.message);
      } else if (result && result.length > 0) {
        const uniqueMap = new Map<string, CourseOption>();
        result.forEach((item: any) => {
          const courseKey = item.MaKhoaHoc || item.MaKhóaHoc;
          if (courseKey && !uniqueMap.has(courseKey)) {
            const dot = item.Dot || '';
            const hocKy = item.HocKy || '';
            const namHoc = item.NamHoc || '';
            const labelParts = [dot, hocKy, namHoc].filter(Boolean);
            uniqueMap.set(courseKey, {
              key: courseKey,
              label: labelParts.length > 0 ? labelParts.join(' - ') : courseKey,
            });
          }
        });

        const courseOptions = Array.from(uniqueMap.values());
        setCourses(courseOptions);

        if (propCourseKey) {
          setSelectedCourseKey(propCourseKey);
        }
      }
      setLoadingCourses(false);
    };

    fetchCoursesList();
  }, [propCourseKey]);

  // 2. Tải dữ liệu chi tiết khi chọn khóa học
  useEffect(() => {
    if (selectedCourseKey) {
      fetchHistoryData(selectedCourseKey);
    } else {
      setData([]);
    }
  }, [selectedCourseKey]);

  const fetchHistoryData = async (courseKey: string) => {
    setLoading(true);
    
    // Lấy đồng thời lịch sử khóa học và bảng ChamDiem để đồng bộ GhiChu mới nhất
    const [historyRes, chamDiemRes] = await Promise.all([
      supabase.from('KhoaHocDaKetThuc').select('*'),
      supabase.from('ChamDiem').select('*')
    ]);

    if (historyRes.error) {
      console.error('Lỗi tải lịch sử khóa học:', historyRes.error.message);
    } else if (historyRes.data) {
      const filteredData = historyRes.data.filter(
        (item: any) => (item.MaKhoaHoc || item.MaKhóaHoc) === courseKey
      );

      // Tạo bản đồ tra cứu GhiChu từ bảng ChamDiem theo MSSV
      const ghiChuMap = new Map<string, string>();
      if (chamDiemRes.data) {
        chamDiemRes.data.forEach((cd: any) => {
          const mssv = (cd.MSSV || cd.MSV || cd.studentId || cd.MaSV || '').trim();
          if (mssv && cd.GhiChu) {
            ghiChuMap.set(mssv, cd.GhiChu);
          }
        });
      }
      
      // Map dữ liệu, ưu tiên lấy GhiChu từ bảng ChamDiem và lọc bỏ ký tự 'x' cũ
      const mappedData: HistoryRecord[] = filteredData.map((item: any) => {
        const mssv = (item.MSSV || '').trim();
        let note = ghiChuMap.get(mssv) || item.GhiChu || item.TruongPhong || '';
        
        // Loại bỏ ký tự 'x' hoặc 'X' do logic trưởng phòng cũ để lại
        if (note === 'x' || note === 'X') {
          note = '';
        }

        return {
          ...item,
          GhiChu: note,
        };
      });

      setData(mappedData);
    }
    setLoading(false);
  };

  const filtered = data.filter(
    (item) =>
      item.HoVaTen?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.MSSV?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Lop?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.GhiChu?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="history-container">
      {/* Thanh lựa chọn Khóa Học & Tìm kiếm */}
      <div className="history-controls">
        <div className="history-dropdown-wrapper">
          <label className="history-label">
            📚 Chọn khóa học:
          </label>
          <select
            value={selectedCourseKey}
            onChange={(e) => setSelectedCourseKey(e.target.value)}
            disabled={loadingCourses || courses.length === 0}
            className="history-select"
          >
            <option value="">-- Vui lòng chọn đợt/học kỳ --</option>
            {loadingCourses ? (
              <option value="" disabled>Đang tải danh sách...</option>
            ) : (
              courses.map((course) => (
                <option key={course.key} value={course.key}>
                  {course.label}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedCourseKey && (
          <input
            type="text"
            placeholder="🔍 Tìm theo Họ tên, MSSV, Lớp, Ghi chú..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="history-search-input"
          />
        )}
      </div>

      {/* Giao diện khi chưa chọn khóa học */}
      {!selectedCourseKey ? (
        <div className="history-empty-state">
          <p className="history-empty-text">
            Vui lòng chọn một đợt học / học kỳ từ danh sách phía trên để hiển thị thông tin chi tiết.
          </p>
        </div>
      ) : (
        <>
          {/* Thông tin tiêu đề khóa học */}
          <div className="history-course-header">
            <h2 className="history-course-title">
              {data[0] ? `${data[0].Dot} - ${data[0].HocKy} - ${data[0].NamHoc}` : selectedCourseKey}
            </h2>
            <p className="history-course-subtitle">
              Tổng số sinh viên ghi nhận: <strong>{data.length}</strong>
            </p>
          </div>

          {/* Bảng Dữ Liệu */}
          {loading ? (
            <p style={{ padding: '20px 0', color: '#64748b', textAlign: 'center' }}>Đang tải dữ liệu khóa học...</p>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>MSSV</th>
                    <th>HỌ VÀ TÊN</th>
                    <th>GIỚI TÍNH</th>
                    <th>LỚP</th>
                    <th>PHÒNG</th>
                    <th className="text-center">VẮNG</th>
                    <th className="text-center">ĐI TRỄ</th>
                    <th>GHI CHÚ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        Không tìm thấy dữ liệu sinh viên phù hợp.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, index) => (
                      <tr key={item.id || index}>
                        <td>{index + 1}</td>
                        <td className="col-mssv">{item.MSSV}</td>
                        <td>{item.HoVaTen}</td>
                        <td>{item.GioiTinh}</td>
                        <td>{item.Lop}</td>
                        <td>{item.Phong || '-'}</td>
                        <td className={`text-center ${item.Vang ? 'icon-check-absent' : 'icon-dash'}`}>
                          {item.Vang ? '✔' : '-'}
                        </td>
                        <td className={`text-center ${item.DiTre ? 'icon-check-late' : 'icon-dash'}`}>
                          {item.DiTre ? '✔' : '-'}
                        </td>
                        <td>{item.GhiChu || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}