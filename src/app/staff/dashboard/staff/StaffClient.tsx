"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleStaffActive,
  createStaffAccount,
  adminResetStaffPassword,
} from "@/app/actions/staff";
import {
  validatePersonName,
  validatePhoneNumber,
  validateEmail,
  validateStaffUsername,
  validateStaffPassword,
  sanitizePhoneInput,
} from "@/lib/validation";
import {
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Calendar,
  Crown,
  UserPlus,
  Wrench,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
} from "lucide-react";

interface StaffItem {
  staff_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role_id: number;
  role_name: string;
  role_description: string | null;
  is_active: boolean;
  hire_date: string;
}

interface RoleOption {
  role_id: number;
  role_name: string;
  description: string | null;
}

export default function StaffClient({
  staffList,
  roles,
  currentUserRole,
}: {
  staffList: StaffItem[];
  roles: RoleOption[];
  currentUserRole: string;
}) {
  const [members, setMembers] = useState(staffList);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  // Create Staff Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Reset Password Modal
  const [resetModalStaff, setResetModalStaff] = useState<StaffItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const isAdmin = currentUserRole.toLowerCase() === "admin";

  const handleOpenResetModal = (staff: StaffItem) => {
    setResetModalStaff(staff);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResetError(null);
  };

  const handleCloseResetModal = () => {
    setResetModalStaff(null);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResetError(null);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalStaff) return;
    setResetError(null);

    if (newPassword.length < 12) {
      setResetError("Password must be at least 12 characters long.");
      return;
    }
    if (newPassword.length > 128) {
      setResetError("Password cannot exceed 128 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setResetError("Password must contain at least one uppercase letter (A-Z).");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setResetError("Password must contain at least one lowercase letter (a-z).");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setResetError("Password must contain at least one number (0-9).");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setResetError("Password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match. Please verify confirmation.");
      return;
    }

    startTransition(async () => {
      const res = await adminResetStaffPassword(resetModalStaff.staff_id, newPassword);
      if (res.success) {
        setMessage({
          type: "success",
          text: `Password for ${resetModalStaff.full_name} (@${resetModalStaff.username}) was reset successfully.`,
        });
        handleCloseResetModal();
        router.refresh();
      } else {
        setResetError(res.error || "Failed to reset password.");
      }
    });
  };

  const handleToggle = (staffId: number, currentStatus: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const res = await toggleStaffActive(staffId);
      if (res.success) {
        setMembers((prev) =>
          prev.map((m) =>
            m.staff_id === staffId ? { ...m, is_active: !currentStatus } : m
          )
        );
        setMessage({
          type: "success",
          text: `Staff account #${staffId} status updated.`,
        });
      } else {
        setMessage({ type: "error", text: res.error || "Failed to update staff status." });
      }
    });
  };

  const handleCreateStaff = (formData: FormData) => {
    setMessage(null);
    const fn = (formData.get("firstName") as string) || newFirstName;
    const ln = (formData.get("lastName") as string) || newLastName;
    const un = (formData.get("username") as string) || newUsername;
    const pwd = (formData.get("password") as string) || createPassword;
    const email = (formData.get("email") as string) || newEmail;
    const phone = (formData.get("phone") as string) || newPhone;

    const fnCheck = validatePersonName(fn, "First name", 50);
    if (!fnCheck.isValid) {
      setMessage({ type: "error", text: fnCheck.error || "Invalid first name." });
      return;
    }
    const lnCheck = validatePersonName(ln, "Last name", 50);
    if (!lnCheck.isValid) {
      setMessage({ type: "error", text: lnCheck.error || "Invalid last name." });
      return;
    }
    const unCheck = validateStaffUsername(un);
    if (!unCheck.isValid) {
      setMessage({ type: "error", text: unCheck.error || "Invalid username." });
      return;
    }
    const pwdCheck = validateStaffPassword(pwd);
    if (!pwdCheck.isValid) {
      setMessage({ type: "error", text: pwdCheck.error || "Invalid password." });
      return;
    }
    if (phone && phone.trim()) {
      const phoneCheck = validatePhoneNumber(phone, "Phone number", false);
      if (!phoneCheck.isValid) {
        setMessage({ type: "error", text: phoneCheck.error || "Invalid phone number." });
        return;
      }
    }
    if (email && email.trim()) {
      const emailCheck = validateEmail(email, "Email address", false);
      if (!emailCheck.isValid) {
        setMessage({ type: "error", text: emailCheck.error || "Invalid email address." });
        return;
      }
    }

    startTransition(async () => {
      const res = await createStaffAccount(formData);
      if (res.success) {
        setMessage({
          type: "success",
          text: "New staff account created successfully with Argon2id credentials.",
        });
        setCreateModalOpen(false);
        setNewFirstName("");
        setNewLastName("");
        setNewUsername("");
        setCreatePassword("");
        setNewEmail("");
        setNewPhone("");
      } else {
        setMessage({ type: "error", text: res.error || "Failed to create staff account." });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-amber-500" />
            {isAdmin ? "Staff & Access Control Management" : "Hotel Staff Directory"}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAdmin
              ? "Comprehensive administration of hotel staff accounts, system credentials, and active permissions."
              : "Overview of registered hotel staff members, assigned departments, and contact information."}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition shadow-lg shadow-amber-500/10 flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Create Staff Account
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Staff Roster Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Staff ID</th>
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Role &amp; Permissions</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">Hire Date</th>
                <th className="py-3.5 px-4">Status</th>
                {isAdmin && <th className="py-3.5 px-4 text-right">Access Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {members.map((s) => {
                const roleLower = s.role_name.toLowerCase();
                const isSystem = s.staff_id === 1;

                return (
                  <tr key={s.staff_id} className="hover:bg-slate-850/40 transition">
                    <td className="py-4 px-4 font-mono font-medium text-amber-400">
                      #{s.staff_id}
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {s.full_name}
                        {roleLower === "admin" && (
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        @{s.username}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          roleLower === "admin"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : roleLower === "manager"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : roleLower === "receptionist"
                            ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            : roleLower === "maintenance"
                            ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {roleLower === "admin" && <Crown className="w-3 h-3" />}
                        {roleLower === "manager" && <KeyRound className="w-3 h-3" />}
                        {roleLower === "receptionist" && <ShieldCheck className="w-3 h-3" />}
                        {roleLower === "maintenance" && <Wrench className="w-3 h-3" />}
                        {roleLower === "housekeeping" && <Sparkles className="w-3 h-3" />}
                        {s.role_name}
                      </span>
                      <div className="text-[11px] text-slate-500 mt-1 max-w-xs truncate">
                        {s.role_description}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-xs">
                      {s.phone && (
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {s.phone}
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-500" />
                          {s.email}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 text-xs text-slate-400 font-mono">
                      {s.hire_date}
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          s.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {s.is_active ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {s.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>

                    {isAdmin && (
                      <td className="py-4 px-4 text-right">
                        {isSystem ? (
                          <span className="text-[11px] text-slate-500 italic">
                            System Lock
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {s.is_active && (
                              <button
                                onClick={() => handleOpenResetModal(s)}
                                disabled={isPending}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                title={`Reset password for @${s.username}`}
                              >
                                <KeyRound className="w-3 h-3" />
                                Reset Password
                              </button>
                            )}
                            <button
                              onClick={() => handleToggle(s.staff_id, s.is_active)}
                              disabled={isPending}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                                s.is_active
                                  ? "bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/30"
                                  : "bg-emerald-500 hover:bg-emerald-600 text-slate-950"
                              }`}
                            >
                              {s.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Staff Account Modal (Admin Exclusive) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-500" />
              Create Staff Account
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Add a new staff member and assign their departmental role and system credentials.
            </p>

            <form action={handleCreateStaff} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    First Name
                  </label>
                  <input
                    name="firstName"
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value.replace(/[\d\p{N}]/gu, ""))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text").replace(/[\d\p{N}]/gu, "");
                      setNewFirstName((prev) => (prev + text).slice(0, 50));
                    }}
                    placeholder="e.g. Tariq"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Last Name
                  </label>
                  <input
                    name="lastName"
                    type="text"
                    required
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value.replace(/[\d\p{N}]/gu, ""))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = e.clipboardData.getData("text").replace(/[\d\p{N}]/gu, "");
                      setNewLastName((prev) => (prev + text).slice(0, 50));
                    }}
                    placeholder="e.g. Khan"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Username
                  </label>
                  <input
                    name="username"
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_\-\.]/g, "").slice(0, 30))}
                    placeholder="e.g. tkhan"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Temporary Password
                  </label>
                  <input
                    name="password"
                    type="password"
                    required
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Departmental Role
                </label>
                <select
                  name="roleId"
                  required
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  {roles.map((r) => (
                    <option key={r.role_id} value={r.role_id}>
                      {r.role_name} — {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Email Address
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="tkhan@hotel.com"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Phone Number
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(sanitizePhoneInput(e.target.value))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = sanitizePhoneInput(e.clipboardData.getData("text"));
                      setNewPhone(text);
                    }}
                    placeholder="03001234567 or +923001234567"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {isPending ? "Creating Account..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Staff Password Modal (Admin Exclusive) */}
      {resetModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white font-serif flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                Reset Staff Password
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                Staff ID #{resetModalStaff.staff_id}
              </span>
            </div>

            {/* Target Account Summary */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{resetModalStaff.full_name}</p>
                <p className="text-xs text-slate-400 font-mono">@{resetModalStaff.username}</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                {resetModalStaff.role_name}
              </span>
            </div>

            {resetError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              {/* New Password Input */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Enter new strong password"
                    className="w-full p-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full p-2.5 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Policy Guidelines */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                  Security Policy Requirements:
                </p>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span className={newPassword.length >= 12 && newPassword.length <= 128 ? "text-emerald-400" : "text-slate-500"}>
                    • 12 to 128 characters
                  </span>
                  <span className={/[A-Z]/.test(newPassword) ? "text-emerald-400" : "text-slate-500"}>
                    • 1+ uppercase letter
                  </span>
                  <span className={/[a-z]/.test(newPassword) ? "text-emerald-400" : "text-slate-500"}>
                    • 1+ lowercase letter
                  </span>
                  <span className={/[0-9]/.test(newPassword) ? "text-emerald-400" : "text-slate-500"}>
                    • 1+ digit (0-9)
                  </span>
                  <span className={/[^A-Za-z0-9]/.test(newPassword) ? "text-emerald-400" : "text-slate-500"}>
                    • 1+ special symbol
                  </span>
                  <span className={newPassword.length > 0 && newPassword === confirmPassword ? "text-emerald-400" : "text-slate-500"}>
                    • Passwords match
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseResetModal}
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {isPending ? "Resetting Password..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
