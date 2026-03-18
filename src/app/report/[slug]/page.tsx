"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { SEVERITY_CONFIG, type Severity } from "@/types";
import { formatFileSize } from "@/lib/utils";

interface UploadedFile {
  path: string;
  name: string;
  type: string;
  size: number;
}

interface FormData {
  title: string;
  where_found: string;
  steps_taken: string;
  expected_behavior: string;
  actual_behavior: string;
  severity: Severity | "";
  device_info: string;
  reporter_name: string;
  reporter_email: string;
}

const INITIAL_FORM: FormData = {
  title: "",
  where_found: "",
  steps_taken: "",
  expected_behavior: "",
  actual_behavior: "",
  severity: "",
  device_info: "",
  reporter_name: "",
  reporter_email: "",
};

export default function ReportPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ number: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectError, setProjectError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect device info
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      let device = "Desconhecido";
      if (/Android/i.test(ua)) {
        const match = ua.match(/Android\s([0-9.]+).*;\s(.*?)\sBuild/);
        device = match
          ? `${match[2]} / Android ${match[1]}`
          : "Android";
      } else if (/iPhone|iPad/i.test(ua)) {
        const match = ua.match(/OS\s([\d_]+)/);
        device = match
          ? `iPhone / iOS ${match[1].replace(/_/g, ".")}`
          : "iOS";
      } else if (/Windows/i.test(ua)) {
        device = "Windows / Desktop";
      } else if (/Mac/i.test(ua)) {
        device = "Mac / Desktop";
      }
      setForm((f) => ({ ...f, device_info: device }));
    }
  }, []);

  // Restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`bug-report-${slug}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((f) => ({ ...f, ...parsed }));
      } catch {}
    }
  }, [slug]);

  // Auto-save to localStorage
  useEffect(() => {
    if (submitted) return;
    const timer = setTimeout(() => {
      localStorage.setItem(`bug-report-${slug}`, JSON.stringify(form));
    }, 500);
    return () => clearTimeout(timer);
  }, [form, slug, submitted]);

  // Validate project slug
  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?slug=eq.${slug}&is_active=eq.true&select=name`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.length > 0) {
          setProjectName(data[0].name);
        } else {
          setProjectError(true);
        }
      })
      .catch(() => setProjectError(true));
  }, [slug]);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (files.length + selectedFiles.length > 3) {
      setError("Maximo de 3 arquivos");
      return;
    }

    for (const file of selectedFiles) {
      if (file.size > 100 * 1024 * 1024) {
        setError(`${file.name}: Arquivo muito grande (max 100MB)`);
        continue;
      }

      const validTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "video/webm",
      ];
      if (!validTypes.includes(file.type)) {
        setError(`${file.name}: Formato nao suportado`);
        continue;
      }

      setUploading(true);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("project_slug", slug);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error?.message || "Erro no upload");
        } else {
          setFiles((f) => [...f, data.file]);
          setError(null);
        }
      } catch {
        setError("Erro ao enviar arquivo. Tente novamente.");
      }

      setUploading(false);
      setUploadProgress(0);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((f) => f.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!form.title.trim() || form.title.trim().length < 5)
      errors.title = "Minimo 5 caracteres";
    if (!form.where_found.trim() || form.where_found.trim().length < 3)
      errors.where_found = "Descreva onde encontrou o problema";
    if (!form.steps_taken.trim() || form.steps_taken.trim().length < 5)
      errors.steps_taken = "Minimo 5 caracteres";
    if (
      !form.expected_behavior.trim() ||
      form.expected_behavior.trim().length < 5
    )
      errors.expected_behavior = "Minimo 5 caracteres";
    if (
      !form.actual_behavior.trim() ||
      form.actual_behavior.trim().length < 5
    )
      errors.actual_behavior = "Minimo 5 caracteres";
    if (!form.severity) errors.severity = "Selecione a gravidade";
    if (files.length === 0) errors.files = "Anexe pelo menos uma evidencia";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_slug: slug,
          title: form.title,
          where_found: form.where_found,
          steps_taken: form.steps_taken,
          expected_behavior: form.expected_behavior,
          actual_behavior: form.actual_behavior,
          severity: form.severity,
          device_info: form.device_info,
          reporter_name: form.reporter_name,
          reporter_email: form.reporter_email,
          attachment_paths: files,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Erro ao enviar");
        if (data.error?.fields) setFieldErrors(data.error.fields);
      } else {
        setSubmitted({ number: data.bug.number });
        localStorage.removeItem(`bug-report-${slug}`);
      }
    } catch {
      setError("Erro de conexao. Verifique sua internet e tente novamente.");
    }

    setSubmitting(false);
  };

  // Project not found
  if (projectError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Projeto nao encontrado</h1>
          <p className="text-gray-500">O link que voce acessou nao corresponde a nenhum projeto ativo.</p>
        </div>
      </div>
    );
  }

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Bug #{submitted.number} enviado!
          </h1>
          <p className="text-gray-500 mb-6">
            Recebemos seu report e a equipe sera notificada. Obrigado por ajudar a melhorar o produto!
          </p>
          <button
            onClick={() => {
              setSubmitted(null);
              setForm(INITIAL_FORM);
              setFiles([]);
            }}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Reportar outro bug
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-400">
              {projectName || slug}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reportar um bug</h1>
          <p className="text-gray-500 text-sm mt-1">
            Descreva o problema que encontrou. Quanto mais detalhes, mais rapido conseguimos resolver.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Reporter info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seu nome <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.reporter_name}
                onChange={(e) => updateField("reporter_name", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seu email <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="email"
                value={form.reporter_email}
                onChange={(e) => updateField("reporter_email", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
                placeholder="email@exemplo.com"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titulo do Bug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition ${fieldErrors.title ? "border-red-300" : "border-gray-200"}`}
              placeholder='Ex: Botao "Fazer Pix" nao responde ao toque'
              maxLength={200}
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.title}</p>
            )}
          </div>

          {/* Where found */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Onde encontrou <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.where_found}
              onChange={(e) => updateField("where_found", e.target.value)}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition ${fieldErrors.where_found ? "border-red-300" : "border-gray-200"}`}
              placeholder="Ex: Tela inicial > Menu > Pix > Botao Fazer Pix"
              maxLength={300}
            />
            {fieldErrors.where_found && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.where_found}</p>
            )}
          </div>

          {/* Steps taken */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              O que fez <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.steps_taken}
              onChange={(e) => updateField("steps_taken", e.target.value)}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition resize-none ${fieldErrors.steps_taken ? "border-red-300" : "border-gray-200"}`}
              placeholder="Ex: Abri o app, fui no menu, cliquei em Pix, toquei no botao"
              rows={3}
              maxLength={1000}
            />
            {fieldErrors.steps_taken && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.steps_taken}</p>
            )}
          </div>

          {/* Expected behavior */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              O que esperava <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.expected_behavior}
              onChange={(e) => updateField("expected_behavior", e.target.value)}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition resize-none ${fieldErrors.expected_behavior ? "border-red-300" : "border-gray-200"}`}
              placeholder="Ex: Esperava abrir a tela de transferencia Pix"
              rows={2}
              maxLength={1000}
            />
            {fieldErrors.expected_behavior && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.expected_behavior}</p>
            )}
          </div>

          {/* Actual behavior */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              O que aconteceu <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.actual_behavior}
              onChange={(e) => updateField("actual_behavior", e.target.value)}
              className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition resize-none ${fieldErrors.actual_behavior ? "border-red-300" : "border-gray-200"}`}
              placeholder="Ex: Nada. O botao nao responde. Tela fica travada."
              rows={2}
              maxLength={1000}
            />
            {fieldErrors.actual_behavior && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.actual_behavior}</p>
            )}
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quanto isso te atrapalha? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                Object.entries(SEVERITY_CONFIG) as [
                  Severity,
                  (typeof SEVERITY_CONFIG)[Severity],
                ][]
              ).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateField("severity", key)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    form.severity === key
                      ? `${config.bgColor} border-current ${config.color}`
                      : "border-gray-100 hover:border-gray-200 bg-white"
                  }`}
                >
                  <div
                    className={`text-sm font-semibold ${form.severity === key ? config.color : "text-gray-700"}`}
                  >
                    {config.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">
                    {config.description}
                  </div>
                </button>
              ))}
            </div>
            {fieldErrors.severity && (
              <p className="mt-1 text-xs text-red-500">
                {fieldErrors.severity}
              </p>
            )}
          </div>

          {/* Device info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dispositivo / Sistema
            </label>
            <input
              type="text"
              value={form.device_info}
              onChange={(e) => updateField("device_info", e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
              placeholder="Ex: Samsung Galaxy A34 / Android 14"
              maxLength={200}
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Evidencia (video ou print) <span className="text-red-500">*</span>
            </label>

            {/* Uploaded files */}
            {files.length > 0 && (
              <div className="space-y-2 mb-3">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-400">
                        {file.type.startsWith("video/") ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm text-gray-700 truncate">
                        {file.name}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 ml-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload area */}
            {files.length < 3 && (
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  uploading
                    ? "border-gray-300 bg-gray-50"
                    : fieldErrors.files
                      ? "border-red-300 bg-red-50/30"
                      : "border-gray-200 hover:border-gray-300 cursor-pointer"
                }`}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  onChange={handleFileSelect}
                  className="hidden"
                  multiple
                />
                {uploading ? (
                  <div>
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Enviando...</p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      Toque para escolher ou arraste um arquivo
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      MP4, MOV, WebM, JPG, PNG ou WebP (max 100MB)
                    </p>
                  </div>
                )}
              </div>
            )}

            {fieldErrors.files && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.files}</p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || uploading}
            className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enviando...
              </span>
            ) : (
              "Enviar report"
            )}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Seus dados sao salvos automaticamente enquanto voce preenche.
          </p>
        </form>
      </div>
    </div>
  );
}
