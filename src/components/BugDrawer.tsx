"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "./StatusBadge";
import { SeverityBadge } from "./SeverityBadge";
import { authHeaders } from "@/lib/auth";
import { formatRelativeDate } from "@/lib/utils";
import {
  STATUS_CONFIG,
  type Bug,
  type BugNote,
  type AuditLogEntry,
  type BugAttachment,
  type BugStatus,
  type TeamMember,
} from "@/types";

interface BugDetail extends Bug {
  attachments: (BugAttachment & { url: string | null })[];
  notes: BugNote[];
  audit_log: AuditLogEntry[];
}

interface BugDrawerProps {
  bugId: string | null;
  teamMembers: TeamMember[];
  onClose: () => void;
  onUpdate: () => void;
}

export function BugDrawer({
  bugId,
  teamMembers,
  onClose,
  onUpdate,
}: BugDrawerProps) {
  const [bug, setBug] = useState<BugDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!bugId) {
      setBug(null);
      return;
    }
    fetchBug();
  }, [bugId]);

  const fetchBug = async () => {
    if (!bugId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bugs/${bugId}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBug(data);
      }
    } catch {}
    setLoading(false);
  };

  const updateBug = async (updates: Record<string, unknown>) => {
    if (!bug) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/bugs/${bug.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...updates, version: bug.version }),
      });

      if (res.ok) {
        await fetchBug();
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error?.message || "Erro ao atualizar");
      }
    } catch {}
    setUpdatingStatus(false);
  };

  const addNote = async () => {
    if (!bug || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/bugs/${bug.id}/notes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: noteText }),
      });

      if (res.ok) {
        setNoteText("");
        await fetchBug();
      }
    } catch {}
    setSavingNote(false);
  };

  if (!bugId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white z-50 shadow-2xl overflow-y-auto border-l border-gray-200">
        {loading && !bug ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : bug ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-gray-100">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono text-gray-400">
                    #{bug.number}
                  </span>
                  <StatusBadge status={bug.status} />
                  <SeverityBadge severity={bug.severity} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 leading-snug">
                  {bug.title}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {bug.reporter_name || "Anonimo"} &middot;{" "}
                  {formatRelativeDate(bug.created_at)}
                  {bug.device_info && ` &middot; ${bug.device_info}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors -mr-2 -mt-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Controls */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Status
                  </label>
                  <select
                    value={bug.status}
                    onChange={(e) =>
                      updateBug({ status: e.target.value as BugStatus })
                    }
                    disabled={updatingStatus}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Responsavel
                  </label>
                  <select
                    value={bug.assigned_to || ""}
                    onChange={(e) =>
                      updateBug({
                        assigned_to: e.target.value || null,
                      })
                    }
                    disabled={updatingStatus}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Ninguem</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-4">
                <DetailBlock label="Onde encontrou" value={bug.where_found} />
                <DetailBlock label="O que fez" value={bug.steps_taken} />
                <DetailBlock
                  label="O que esperava"
                  value={bug.expected_behavior}
                />
                <DetailBlock
                  label="O que aconteceu"
                  value={bug.actual_behavior}
                />
              </div>

              {/* Attachments */}
              {bug.attachments && bug.attachments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Evidencias
                  </h3>
                  <div className="space-y-2">
                    {bug.attachments.map((att) => (
                      <div key={att.id}>
                        {att.file_type.startsWith("video/") && att.url ? (
                          <video
                            src={att.url}
                            controls
                            className="w-full rounded-xl border border-gray-200"
                            preload="metadata"
                          />
                        ) : att.file_type.startsWith("image/") && att.url ? (
                          <img
                            src={att.url}
                            alt={att.file_name}
                            className="w-full rounded-xl border border-gray-200"
                          />
                        ) : (
                          <a
                            href={att.url || "#"}
                            target="_blank"
                            rel="noopener"
                            className="block px-3 py-2 bg-gray-50 rounded-xl text-sm text-blue-600 hover:underline"
                          >
                            {att.file_name}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Notas internas
                </h3>
                {bug.notes && bug.notes.length > 0 ? (
                  <div className="space-y-2 mb-3">
                    {bug.notes.map((note) => (
                      <div
                        key={note.id}
                        className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-600">
                            {note.author?.name || "Desconhecido"}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatRelativeDate(note.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {note.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mb-3">
                    Nenhuma nota ainda
                  </p>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Adicionar nota..."
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        addNote();
                      }
                    }}
                  />
                  <button
                    onClick={addNote}
                    disabled={savingNote || !noteText.trim()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    Enviar
                  </button>
                </div>
              </div>

              {/* Audit log */}
              {bug.audit_log && bug.audit_log.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Historico
                  </h3>
                  <div className="space-y-1">
                    {bug.audit_log.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-2 text-xs text-gray-500 py-1"
                      >
                        <span className="text-gray-400 flex-shrink-0 w-12">
                          {formatRelativeDate(entry.created_at)}
                        </span>
                        <span>
                          <span className="font-medium text-gray-600">
                            {entry.actor?.name || "Sistema"}
                          </span>
                          {" "}
                          {entry.action === "status_changed" ? (
                            <>
                              alterou status de{" "}
                              <span className="font-mono">
                                {STATUS_CONFIG[entry.old_value as BugStatus]
                                  ?.label || entry.old_value}
                              </span>
                              {" "}para{" "}
                              <span className="font-mono">
                                {STATUS_CONFIG[entry.new_value as BugStatus]
                                  ?.label || entry.new_value}
                              </span>
                            </>
                          ) : entry.action === "assigned" ? (
                            <>atribuiu a um membro da equipe</>
                          ) : entry.action === "note_added" ? (
                            <>adicionou uma nota</>
                          ) : (
                            <>{entry.action}</>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-800 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
