import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../../utils/supabase/info';
import { Button } from '../base/button';
import { Label } from '../ui/label';

const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

interface ImageUploadProps {
  label: string;
  value: string | undefined;
  onChange: (url: string) => void;
  placeholder?: string;
  helpText?: string;
  maxSizeMB?: number;
  aspectRatio?: string;
}

export function ImageUpload({
  label,
  value,
  onChange,
  placeholder,
  helpText,
  maxSizeMB = 10,
  aspectRatio,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Arquivo deve ser uma imagem');
      return;
    }

    // Validate file size
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > maxSizeMB) {
      toast.error(`Imagem muito grande. Máximo ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API}/banners/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          apikey: publicAnonKey,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha no upload');
      }

      const data = await res.json();
      if (data.success && data.url) {
        onChange(data.url);
        toast.success('Imagem enviada com sucesso!');
      } else {
        throw new Error('URL da imagem não retornada');
      }
    } catch (err: any) {
      console.error('ImageUpload error:', err);
      toast.error(err.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    onChange('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      
      {value ? (
        // Preview with remove button
        <div className="relative group">
          <div 
            className="relative rounded-lg overflow-hidden border border-border bg-secondary/30"
            style={aspectRatio ? { aspectRatio } : { minHeight: '120px' }}
          >
            <img 
              src={value} 
              alt="Preview" 
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                const icon = document.createElement('div');
                icon.className = 'text-muted-foreground flex flex-col items-center gap-2';
                icon.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span class="text-xs">Erro ao carregar imagem</span>';
                target.parentElement?.appendChild(icon);
              }}
            />
          </div>
          <Button
            color="secondary"
            size="sm"
            onClick={handleRemove}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm"
            disabled={uploading}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Remover
          </Button>
        </div>
      ) : (
        // Upload dropzone
        <div
          className={`relative rounded-lg border-2 border-dashed transition-all ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border/80 bg-secondary/30'
          } ${uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
          style={aspectRatio ? { aspectRatio } : { minHeight: '120px' }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Enviando...</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {placeholder || 'Clique ou arraste uma imagem'}
                  </p>
                  {helpText && (
                    <p className="text-xs text-muted-foreground mt-0.5">{helpText}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Máximo {maxSizeMB}MB • JPG, PNG, GIF, WebP
                  </p>
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
          />
        </div>
      )}
    </div>
  );
}
