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
      contact: contact.trim() || 'Mumbai Local',
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b101c] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Commuter account</h2>
              <p className="text-xs text-slate-400">Stored offline-first · Syncs when online</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#05070b] text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Aditya Mishra"
              className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3.5 py-2.5 text-base text-white outline-none focus:border-cyan-400/60 sm:text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Mobile or email</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g., +91 98xxx xxxxx / email"
              className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3.5 py-2.5 text-base text-white outline-none focus:border-cyan-400/60 sm:text-sm"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleGuestMode}
              className="pressable flex-1 rounded-xl border border-white/10 bg-[#05070b] py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]"
            >
              Guest Mode (MVP)
            </button>
            <button
              type="submit"
              className="pressable flex-1 rounded-xl bg-cyan-400 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
            >
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
