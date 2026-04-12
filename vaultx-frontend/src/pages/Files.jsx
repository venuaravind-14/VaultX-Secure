import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { api } from '../api/axios';
import { FileText, Share2, Download, Trash2, UploadCloud, Search, Loader2, Image as ImageIcon, FileArchive, File as FileGeneric } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import ShareModal from '../components/ShareModal';

export default function Files() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [shareModalFile, setShareModalFile] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const res = await api.get('/files?limit=100');
      return res.data?.data?.files || [];
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const config = {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      };
      
      return await api.post('/files', formData, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['files']);
      toast.success('File uploaded and encrypted successfully!');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Upload failed');
    },
    onSettled: () => {
      setIsUploading(false);
      setUploadProgress(0);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await api.delete(`/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['files']);
      toast.success('File deleted');
    }
  });

  const handleDownload = async (file) => {
    const toastId = toast.loading('Decrypting and downloading...');
    try {
      const response = await api.get(`/files/${file._id}`, { responseType: 'blob' });
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.original_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Download complete', { id: toastId });
    } catch (error) {
      toast.error('Download failed', { id: toastId });
    }
  };

  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    if (fileRejections?.length > 0) {
      toast.error(fileRejections[0].errors[0]?.message || 'Invalid file type or size');
      return;
    }
    const file = acceptedFiles[0];
    if (file) {
      setIsUploading(true);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    multiple: false,
    maxSize: 50 * 1024 * 1024, // 50MB
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
      'application/zip': ['.zip']
    }
  });

  // Client-side filtering
  const filteredFiles = data?.filter(f => 
    f.original_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-blue-500" />;
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return <FileArchive className="w-8 h-8 text-orange-500" />;
    if (mimeType === 'application/pdf') return <FileText className="w-8 h-8 text-red-500" />;
    return <FileGeneric className="w-8 h-8 text-slate-500" />;
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">File Manager</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">E2E Encrypted storage</p>
        </div>
        
        <div className="relative w-full md:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Dropzone */}
      <div 
        {...getRootProps()} 
        className={`mb-8 border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          isDragActive 
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
            : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
        } ${isUploading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <UploadCloud size={32} />
        </div>
        <p className="text-lg font-medium text-slate-900 dark:text-white">
          {isDragActive ? 'Drop file here' : 'Drag & drop a file to encrypt and upload'}
        </p>
        <p className="text-sm text-slate-500 mt-2">or click to browse from your device</p>

        {isUploading && (
          <div className="mt-6 max-w-sm mx-auto">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Encrypting & Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div 
                className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* File List/Grid */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[300px]">
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : filteredFiles?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <FileGeneric className="w-12 h-12 mb-2 opacity-50" />
            <p>{searchTerm ? 'No files match your search.' : 'Your vault is empty.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filteredFiles.map(file => (
              <li key={file._id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors flex items-center justify-between group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    {getFileIcon(file.mime_type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate" title={file.original_name}>
                      {file.original_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(file.size_bytes / 1024).toFixed(1)} KB • {format(new Date(file.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleDownload(file)}
                    className="p-2 text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 bg-white dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                  <button 
                    onClick={() => setShareModalFile(file)}
                    className="p-2 text-slate-500 hover:text-accent-600 dark:hover:text-accent-400 bg-white dark:bg-slate-800 hover:bg-accent-50 dark:hover:bg-accent-900/30 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                    title="Share"
                  >
                    <Share2 size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      if(window.confirm('Are you sure you want to delete this file?')) {
                        deleteMutation.mutate(file._id);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-danger-600 dark:hover:text-danger-400 bg-white dark:bg-slate-800 hover:bg-danger-50 dark:hover:bg-danger-900/30 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
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
