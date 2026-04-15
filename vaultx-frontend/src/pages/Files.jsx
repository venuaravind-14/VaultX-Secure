import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { api } from '../api/axios';
import {
  FileText, Share2, Download, Trash2, UploadCloud, Search,
  Loader2, Image as ImageIcon, FileArchive, File as FileGeneric,
  FileSpreadsheet, Presentation, AlertCircle, RefreshCw, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import ShareModal from '../components/ShareModal';

// All MIME types the backend accepts
const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

const getFileIcon = (mimeType) => {
  if (!mimeType) return <FileGeneric className="w-6 h-6 text-slate-400" />;
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileText className="w-6 h-6 text-red-500" />;
  if (mimeType.includes('word') || mimeType === 'application/msword')
    return <FileText className="w-6 h-6 text-blue-600" />;
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel')
    return <FileSpreadsheet className="w-6 h-6 text-green-600" />;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return <Presentation className="w-6 h-6 text-orange-500" />;
  if (mimeType.includes('zip') || mimeType.includes('compressed'))
    return <FileArchive className="w-6 h-6 text-amber-500" />;
  return <FileGeneric className="w-6 h-6 text-slate-400" />;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileTypeBadge = (mimeType) => {
  if (!mimeType) return 'FILE';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType === 'application/msword') return 'WORD';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel') return 'EXCEL';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPT';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1].toUpperCase();
  if (mimeType.includes('zip')) return 'ZIP';
  if (mimeType === 'text/plain') return 'TXT';
  if (mimeType === 'text/csv') return 'CSV';
  return mimeType.split('/').pop().toUpperCase().slice(0, 6);
};

export default function Files() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [shareModalFile, setShareModalFile] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const {
    data: filesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const res = await api.get('/files?limit=100');
      return res.data?.data?.files || [];
    },
    staleTime: 30_000,
    retry: 2,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      setUploadError('');
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setUploadProgress(Math.round((e.loaded * 100) / (e.total || 1)));
        },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success(`"${res.data?.data?.file?.original_name}" encrypted & uploaded`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setUploadError(msg);
      toast.error(msg);
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      setDeletingId(id);
      return api.delete(`/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File deleted');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Delete failed');
    },
    onSettled: () => setDeletingId(null),
  });

  const handleDownload = async (file) => {
    setDownloadingId(file._id);
    const toastId = toast.loading(`Decrypting "${file.original_name}"...`);
    try {
      const response = await api.get(`/files/${file._id}`, {
        responseType: 'blob',
        timeout: 120_000,
      });

      const contentType = response.headers['content-type'] || file.mime_type || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download complete', { id: toastId });
    } catch (err) {
      const msg = err.response?.data?.message || 'Download failed';
      toast.error(msg, { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (file) => {
    if (!window.confirm(`Delete "${file.original_name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(file._id);
  };

  const onDrop = useCallback((acceptedFiles, rejections) => {
    setUploadError('');
    if (rejections?.length > 0) {
      const err = rejections[0].errors[0];
      let msg = err?.message || 'Invalid file';
      if (err?.code === 'file-too-large') msg = 'File exceeds 50MB limit';
      if (err?.code === 'file-invalid-type') msg = `File type not supported. Accepted: PDF, Word, Excel, images, ZIP`;
      setUploadError(msg);
      toast.error(msg);
      return;
    }
    if (acceptedFiles.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 50 * 1024 * 1024,
    accept: ACCEPTED_TYPES,
    disabled: isUploading,
  });

  const filteredFiles = (filesData || []).filter(f =>
    !searchTerm || f.original_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="text-primary-500" size={24} />
            Encrypted Vault
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-sm">
            All files are AES-256-GCM encrypted before storage
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer select-none ${
          isDragReject
            ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
            : isDragActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.01]'
            : 'border-slate-300 dark:border-slate-600 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
        } ${isUploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input {...getInputProps()} />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${
          isDragActive ? 'bg-primary-100 dark:bg-primary-900/40' : 'bg-slate-100 dark:bg-slate-700'
        }`}>
          {isUploading
            ? <Loader2 size={28} className="animate-spin text-primary-500" />
            : <UploadCloud size={28} className={isDragActive ? 'text-primary-500' : 'text-slate-400'} />
          }
        </div>

        {isUploading ? (
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300">Encrypting & uploading...</p>
            <div className="mt-3 max-w-xs mx-auto">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span><span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">
              {isDragReject ? 'File type not supported' : isDragActive ? 'Drop to encrypt & upload' : 'Drop files here or click to browse'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint, Images, ZIP — up to 50MB
            </p>
          </div>
        )}

        {uploadError && (
          <div className="mt-3 flex items-center gap-2 justify-center text-red-600 dark:text-red-400 text-sm">
            <AlertCircle size={15} />
            {uploadError}
          </div>
        )}
      </div>

      {/* File List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* List header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {isLoading ? 'Loading...' : `${filteredFiles.length} file${filteredFiles.length !== 1 ? 's' : ''}`}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
          {!isLoading && (
            <button
              onClick={() => refetch()}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <AlertCircle className="text-red-400 w-10 h-10" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {error?.response?.data?.message || 'Failed to load files'}
            </p>
            <button
              onClick={() => refetch()}
              className="text-sm text-primary-600 dark:text-primary-400 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
            <FileGeneric className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium text-slate-700 dark:text-slate-300">
              {searchTerm ? 'No files match your search' : 'Your vault is empty'}
            </p>
            <p className="text-sm mt-1">
              {searchTerm ? `Try a different search term` : 'Upload your first file above'}
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredFiles.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/40">
            {filteredFiles.map(file => (
              <li
                key={file._id}
                className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors group flex items-center justify-between gap-4"
              >
                {/* File info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    {getFileIcon(file.mime_type)}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium text-slate-900 dark:text-white truncate"
                      title={file.original_name}
                    >
                      {file.original_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-1.5 py-0.5 rounded">
                        {getFileTypeBadge(file.mime_type)}
                      </span>
                      <span className="text-xs text-slate-400">{formatBytes(file.size_bytes)}</span>
                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Download */}
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === file._id}
                    title="Download & decrypt"
                    className="p-2 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {downloadingId === file._id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Download size={15} />
                    }
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => setShareModalFile(file)}
                    title="Generate share link"
                    className="p-2 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                  >
                    <Share2 size={15} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file._id}
                    title="Delete file"
                    className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === file._id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />
                    }
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {shareModalFile && (
        <ShareModal
          file={shareModalFile}
          onClose={() => setShareModalFile(null)}
        />
      )}
    </div>
  );
}
