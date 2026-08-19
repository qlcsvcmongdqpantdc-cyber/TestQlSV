import { useState } from 'react';
import { Lock, User as UserIcon, ShieldAlert, GraduationCap, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import type { User } from '../types/auth';

interface LoginProps {
  onLogin: (user: User) => void;
}

// 🔑 TÀI KHOẢN ADMIN GÁN CỨNG TRONG CODE
const HARDCODED_ADMIN: User = {
  id: 'admin-fixed',
  username: 'admin',
  password: '123',
  name: 'Quản Trị Viên (Admin)',
  role: 'admin',
};

export const Login = ({ onLogin }: LoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanUsername = username.trim();

    // 1. Kiểm tra tài khoản Admin gán cứng
    if (cleanUsername === HARDCODED_ADMIN.username && password === HARDCODED_ADMIN.password) {
      setLoading(false);
      onLogin(HARDCODED_ADMIN);
      return;
    }

    // 2. Tra cứu từ cơ sở dữ liệu Supabase (bảng User)
    try {
      const { data, error: dbError } = await supabase
        .from('User')
        .select('*')
        .eq('UserName', cleanUsername)
        .eq('PassW', password)
        .maybeSingle();

      if (dbError) {
        setError('Lỗi kết nối CSDL: ' + dbError.message);
      } else if (data) {
        // Đăng nhập thành công với tài khoản trong Supabase
        const dbUser: User = {
          id: String(data.id),
          username: data.UserName,
          password: data.PassW,
          name: data.HoTen,
          role: data.VaiTro || 'user',
        };
        onLogin(dbUser);
      } else {
        setError('Tài khoản hoặc mật khẩu không chính xác!');
      }
    } catch (err) {
      setError('Đã xảy ra lỗi khi xác thực tài khoản!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: '#fff', padding: '32px', borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px', height: '56px', background: '#dbeafe', color: '#2563eb',
            borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px'
          }}>
            <GraduationCap size={32} />
          </div>
          <h2 style={{ margin: 0, fontSize: '22px', color: '#1e293b' }}>Quản Lý Sinh Viên QPAN TDC</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>
            ĐĂNG NHẬP VÀO QUẢN LÝ TDC
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
            padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Tên đăng nhập
            </label>
            <div style={{ position: 'relative' }}>
              <UserIcon size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tài khoản"
                style={{
                  width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                style={{
                  width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            {loading && <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
            <span>{loading ? 'Đang xác thực...' : 'Đăng Nhập'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};