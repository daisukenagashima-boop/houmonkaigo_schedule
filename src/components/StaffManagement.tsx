import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  addDoc,
  deleteDoc,
  doc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { 
  UserCircle, 
  Mail, 
  Phone, 
  Shield, 
  MapPin, 
  MoreVertical, 
  CheckCircle2, 
  XCircle,
  Search,
  ChevronRight,
  Plus,
  X,
  UserPlus,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function StaffManagement() {
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff' as 'admin' | 'staff',
    assignedAreasStr: '長柄町',
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      async (snapshot) => {
        const staffData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
        setStaff(staffData);

        // クリーンアップ: 旧名称「長島 大介」が含まれるドキュメントを自動的に最適化
        for (const member of staffData) {
          const cleanName = member.name?.replace(/\s+/g, '');
          if (cleanName === '長島大介') {
            try {
              if (member.email === 'daisuke.nagashima@nagarainc.co.jp') {
                // メールアドレスが一致するユーザーは最新名「長嶋 乃祐」に自動的に名義変更
                await updateDoc(doc(db, 'users', member.id), { name: '長嶋 乃祐' });
              } else {
                // 重複する不活性のアカウントは完全に削除
                await deleteDoc(doc(db, 'users', member.id));
              }
            } catch (err) {
              console.warn('Failed to auto-cleanup older user name:', err);
            }
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
    return () => unsubscribe();
  }, []);

  const handleDeleteStaff = async (id: string, name: string) => {
    const confirmDelete = window.confirm(`本当に「${name}」様をデータベースから完全に削除しますか？`);
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'users', id));
      alert(`「${name}」様を削除しました。`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${id}`);
    }
  };

  const handleUpdateRole = async (id: string, role: 'admin' | 'staff') => {
    try {
      await updateDoc(doc(db, 'users', id), { role });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'active' | 'inactive') => {
    try {
      await updateDoc(doc(db, 'users', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.email) return;

    try {
      const assignedAreas = newStaff.assignedAreasStr
        .split(/[,、]/)
        .map(s => s.trim())
        .filter(Boolean);

      await addDoc(collection(db, 'users'), {
        name: newStaff.name,
        email: newStaff.email,
        phone: newStaff.phone || '',
        role: newStaff.role,
        assignedAreas,
        status: newStaff.status,
        createdAt: new Date().toISOString()
      });

      setIsAdding(false);
      setNewStaff({
        name: '',
        email: '',
        phone: '',
        role: 'staff',
        assignedAreasStr: '長柄町',
        status: 'active'
      });
      alert('🎉 新しいスタッフ登録が完了しました！');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-emerald-600" />
          スタッフ管理
        </h1>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-5 rounded-2xl transition-all active:scale-95 shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          新規スタッフ登録
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="名前またはメールアドレスで検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>

      {/* Staff List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredStaff.map((member) => (
          <motion.div
            layout
            key={member.id}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-bold text-xl uppercase shrink-0">
                {member.name ? member.name[0] : '?'}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-lg font-bold text-slate-900 truncate">{member.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                    member.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {member.role === 'admin' ? '管理者' : 'スタッフ'}
                  </span>
                  {member.status === 'inactive' && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase shrink-0">
                      停止中
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 min-w-0">
                  <span className="flex items-center gap-1.5 truncate">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </span>
                  {member.phone && (
                    <span className="flex items-center gap-1.5 text-slate-500 shrink-0">
                      <Phone className="w-4 h-4 shrink-0" />
                      {member.phone}
                    </span>
                  )}
                  {member.assignedAreas && member.assignedAreas.length > 0 && (
                    <span className="flex items-center gap-1.5 text-emerald-600 shrink-0">
                      <MapPin className="w-4 h-4 shrink-0" />
                      {member.assignedAreas.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={member.role}
                onChange={(e) => handleUpdateRole(member.id, e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
              
              <button
                onClick={() => handleUpdateStatus(member.id, member.status === 'inactive' ? 'active' : 'inactive')}
                className={`p-2 rounded-xl transition-all ${
                  member.status === 'inactive' 
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
                title={member.status === 'inactive' ? '有効にする' : '停止する'}
              >
                {member.status === 'inactive' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              </button>

              <button
                onClick={() => handleDeleteStaff(member.id, member.name)}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                title="完全に削除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredStaff.length === 0 && (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
          <UserCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400">スタッフが見つかりません</p>
        </div>
      )}

      {/* Add Staff Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  新規スタッフ登録
                </h2>
                <button
                  onClick={() => setIsAdding(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">スタッフ氏名（漢字） <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="例: 山田 太郎"
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">メールアドレス <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      required
                      placeholder="例: yamada@example.com"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium text-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">電話番号</label>
                    <input
                      type="tel"
                      placeholder="例: 090-1234-5678"
                      value={newStaff.phone}
                      onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">職種</label>
                    <select
                      value={newStaff.role}
                      onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-semibold text-slate-700"
                    >
                      <option value="staff">スタッフ（サービス提供責任者・ヘルパー）</option>
                      <option value="admin">管理者（サ責リーダー・代表）</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">稼働状況</label>
                    <select
                      value={newStaff.status}
                      onChange={(e) => setNewStaff({ ...newStaff, status: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-semibold text-slate-700"
                    >
                      <option value="active">有効（通常稼働）</option>
                      <option value="inactive">停止中（休職等）</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">担当・活動地域（カンマ区切り）</label>
                  <input
                    type="text"
                    placeholder="例: 長柄町、茂原市、市原市"
                    value={newStaff.assignedAreasStr}
                    onChange={(e) => setNewStaff({ ...newStaff, assignedAreasStr: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium text-slate-800"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>スタッフを登録する</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
