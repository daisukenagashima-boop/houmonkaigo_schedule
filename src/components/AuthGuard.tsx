import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  User 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { Home, Loader2, Mail, Lock, LogIn, UserPlus, Sparkles, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  loginAsBypassUser: (email: string, name: string, role: 'admin' | 'staff', password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for active local bypass session first
    const savedUser = localStorage.getItem('bypass_user');
    const savedProfile = localStorage.getItem('bypass_profile');

    if (savedUser && savedProfile) {
      try {
        const parsedUser = JSON.parse(savedUser);
        const parsedProfile = JSON.parse(savedProfile);
        
        // Ensure "長嶋 乃祐" is updated and synced if email matches daisuke.nagashima@nagarainc.co.jp
        if (parsedUser.email === 'daisuke.nagashima@nagarainc.co.jp') {
          parsedProfile.name = '長嶋 乃祐';
          localStorage.setItem('bypass_profile', JSON.stringify(parsedProfile));
        }

        setUser({
          uid: parsedUser.uid,
          email: parsedUser.email,
          emailVerified: true,
          isAnonymous: false,
        } as unknown as User);
        setProfile(parsedProfile);
        setLoading(false);
        return; // Skip normal firebase onAuthStateChanged listener to persist bypass mode
      } catch (e) {
        localStorage.removeItem('bypass_user');
        localStorage.removeItem('bypass_profile');
      }
    }

    // 2. Normal Firebase auth listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (localStorage.getItem('bypass_user')) {
        return;
      }
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const finalProfile = { id: userDoc.id, ...data } as UserProfile;
            
            // Force rename
            if (firebaseUser.email === "daisuke.nagashima@nagarainc.co.jp") {
              finalProfile.name = "長嶋 乃祐";
              await setDoc(doc(db, 'users', firebaseUser.uid), { name: "長嶋 乃祐" }, { merge: true });
            }
            
            setProfile(finalProfile);
          } else {
            // Create initial profile if it doesn't exist yet
            const isTargetUser = firebaseUser.email === "daisuke.nagashima@nagarainc.co.jp";
            const newProfile: Omit<UserProfile, 'id'> = {
              name: isTargetUser ? "長嶋 乃祐" : (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ケアスタッフ'),
              email: firebaseUser.email || '',
              role: isTargetUser ? 'admin' : 'staff',
              createdAt: new Date().toISOString(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile({ id: firebaseUser.uid, ...newProfile });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    localStorage.removeItem('bypass_user');
    localStorage.removeItem('bypass_profile');
    setUser(null);
    setProfile(null);
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const loginAsBypassUser = async (email: string, name: string, role: 'admin' | 'staff', password?: string) => {
    setLoading(true);
    try {
      const uid = "bypass_" + email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
      
      const mockUser = {
        uid,
        email,
        emailVerified: true,
        isAnonymous: false,
      } as unknown as User;

      const isTargetUser = email.toLowerCase() === "daisuke.nagashima@nagarainc.co.jp";
      const finalName = isTargetUser ? "長嶋 乃祐" : name;

      const mockProfile: UserProfile = {
        id: uid,
        name: finalName,
        email,
        role: isTargetUser ? 'admin' : role,
        createdAt: new Date().toISOString(),
        phone: "090-1234-5678",
        assignedAreas: ["長柄町", "茂原市"],
        status: "active",
      };

      // Set profile in Firestore so queries function correctly
      try {
        await setDoc(doc(db, 'users', uid), {
          ...mockProfile,
          ...(password ? { password } : {})
        }, { merge: true });
      } catch (err) {
        console.warn('Could not sync bypass profile to Firestore, continuing in-memory:', err);
      }

      localStorage.setItem('bypass_user', JSON.stringify({ uid, email }));
      localStorage.setItem('bypass_profile', JSON.stringify(mockProfile));

      setUser(mockUser);
      setProfile(mockProfile);
    } catch (error) {
      console.error('Bypass login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut: handleSignOut, loginAsBypassUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, loginAsBypassUser } = useAuth();
  
  // Tab states: 'login' | 'signup'
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  
  // Form input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 animate-pulse">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
          <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Loading Core Engine</p>
        </div>
      </div>
    );
  }

  // Handle manual login
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const uid = "bypass_" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");

      if (activeTab === 'login') {
        const userDoc = await getDoc(doc(db, 'users', uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // If a password was saved and it doesn't match, verify it
          if (userData.password && userData.password !== password) {
            setAuthError('パスワードが正しくありません。');
            setIsSubmitting(false);
            return;
          }
          
          await loginAsBypassUser(cleanEmail, userData.name || cleanEmail.split('@')[0], userData.role || 'staff', password);
        } else {
          // If user does not exist, automatically sign them up for the best experience!
          const defaultName = cleanEmail.split('@')[0];
          const newRole = cleanEmail === 'daisuke.nagashima@nagarainc.co.jp' ? 'admin' : 'staff';
          await loginAsBypassUser(cleanEmail, defaultName, newRole, password);
        }
      } else {
        // Sign-up process
        if (!name) {
          setAuthError('お名前を入力してください。');
          setIsSubmitting(false);
          return;
        }
        const newRole = cleanEmail === 'daisuke.nagashima@nagarainc.co.jp' ? 'admin' : 'staff';
        await loginAsBypassUser(cleanEmail, name, newRole, password);
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      setAuthError(error.message || "認証エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pre-configured Quick Action Login
  const handleQuickDemoAccess = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await loginAsBypassUser("daisuke.nagashima@nagarainc.co.jp", "長嶋 乃祐", "admin", "password123");
    } catch (err: any) {
      console.error("Quick access error:", err);
      setAuthError("クイックアクセスに失敗しました: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 flex flex-col space-y-6 relative overflow-hidden">
          
          {/* Subtle decorative background gradient */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-600"></div>

          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Home className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">訪問介護記録システム</h1>
              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase mt-0.5">Nagarakaigo Home Portal</p>
            </div>
          </div>

          {/* Quick Access Action Panel */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-2xl border border-amber-100/80 space-y-2.5 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1.5 text-amber-800 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>管理者デモとして即時ログインできます</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal">
              OAuthのポップアップ制限に影響されず、60名のダミーデータを一括登録できる「長嶋乃祐」管理者アカウントで即座にログイン（自動作成）します。
            </p>
            <button
              type="button"
              onClick={handleQuickDemoAccess}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all active:scale-[0.98] shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-4 h-4" />
              <span>管理者デモアカウントでクイックログイン</span>
            </button>
          </div>

          {/* Tab Switcher for custom authentication */}
          <div className="flex bg-slate-100/80 p-1 rounded-xl">
            <button
              onClick={() => { setActiveTab('login'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'login' 
                  ? 'bg-white text-emerald-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ログイン
            </button>
            <button
              onClick={() => { setActiveTab('signup'); setAuthError(null); }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'signup' 
                  ? 'bg-white text-emerald-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              新規スタッフ登録
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {authError && (
              <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl border border-red-100 flex items-start gap-2 animate-fade-in font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span className="flex-1">{authError}</span>
              </div>
            )}

            {activeTab === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">お名前</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <UserPlus className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="スタッフの氏名 (例: 山田 花子)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1">メールアドレス</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="caregiver@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-sm pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1">パスワード</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-800 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 ml-1">※パスワードは6文字以上で設定してください。</p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/15"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : activeTab === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>ログイン</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>新規スタッフアカウントを登録</span>
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center leading-normal">
            サービス提供記録、お元気コール、照会回答書などを統合デジタル管理する安全なシステムです
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
