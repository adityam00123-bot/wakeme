import React, { useState } from 'react';
import { UserCheck, X } from 'lucide-react';
import { UserProfile } from '../types/wakeme';

interface AuthModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSaveUser: (updated: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ user, isOpen, onClose, onSaveUser }) => {
  const [name, setName] = useState(user.name);
  const [contact, setContact] = useState(user.contact);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveUser({
      ...user,
      user_id: user.isGuest ? `user-${Date.now().toString(36)}` : user.user_id,
      name: name.trim() || 'Aavishkar Commuter',
      contact: contact.trim() || 'Long-Distance & Local',
      isGuest: false,
    });
    onClose();
  };

  const handleGuestMode = () => {
    onSaveUser({
      ...user,
      user_id: 'guest-commuter',
      name: 'Guest Commuter',
      contact: 'Offline Demo Mode',
      isGuest: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-xs sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#141923]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Commuter account</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stored offline-first · Syncs when online
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-900 dark:border-white/10 dark:bg-[#1c2331] dark:text-slate-400 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Full name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Aditya Mishra"
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-sm dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Mobile or email
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g., +91 98xxx xxxxx / email"
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-sm dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleGuestMode}
              className="pressable flex-1 rounded-xl border border-slate-200 bg-[#edf1f7] py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-[#1c2331] dark:text-slate-200"
            >
              Guest Mode (MVP)
            </button>
            <button
              type="submit"
              className="pressable flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
