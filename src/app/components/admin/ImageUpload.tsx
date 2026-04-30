import React, { useRef, useState } from 'react';
import { AlertCircle, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../../utils/supabase/info';
import { adminFetch } from '../../lib/admin-auth';
import { Button } from '../base/button';
import { Label } from '../ui/label';

const API = `https://${projectId}.supabase.co/functions/v1/home-config-1d6e33e0`;

interface ImageUploadProps {
  label: string;
  value: string | undefined;
  onChange: (url: string) => void;
  placeholder?: string;
  helpText?: string;
  maxSizeMB?: number;
  aspectRatio?: string;
}

function slugifyFileName(value: string): string {
  return String(value || 'banner')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'banner';
}

async function convertToWebp(file: File): Promise<File> {
  if (file.type === 'image/webp') {
    const safeName = `${slugifyFileName(file.name)}.webp`;
    if (file.name.endsWith('.webp')) {
      return file;
    }
    return new File([file], safeName, {
      type: 'image/webp',
      lastModified: file.lastModified || Date.now(),
    });
  }

  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
    throw new Error('Use apenas arquivos PNG, JPG, JPEG ou WebP');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Nao foi possivel abrir a imagem selecionada'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Nao foi possivel preparar a conversao da imagem');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.9);
    });

    if (!blob) {
      throw new Error('Nao foi possivel converter a imagem para WebP');
    }

    return new File([blob], `${slugifyFileName(file.name)}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
    if (!file.type.startsWith('image/')) {
      toast.error('Arquivo deve ser uma imagem');
      return;
    }

    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > maxSizeMB) {
      toast.error(`Imagem muito grande. Maximo ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    try {
      const webpFile = await convertToWebp(file);
      const formData = new FormData();
      formData.append('image', webpFile);

      const res = await adminFetch(`${API}/admin/banners/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Falha no upload');
      }

      const data = await res.json();
      if (!data.success || !data.url) {
        throw new Error('URL da imagem nao retornada');
      }

      onChange(data.url);
      toast.success('Imagem enviada com sucesso em WebP');
    } catch (error: any) {
      console.error('ImageUpload error:', error);
      toast.error(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      void handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      void handleFile(event.target.files[0]);
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
        <div className="relative group">
          <div
            className="relative rounded-lg overflow-hidden border border-border bg-secondary/30"
            style={aspectRatio ? { aspectRatio } : { minHeight: '140px' }}
          >
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          </div>
          <Button
            color="secondary"
            size="sm"
            onClick={handleRemove}
            className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 bg-background/90 backdrop-blur-sm"
            disabled={uploading}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Remover
          </Button>
        </div>
      ) : (
        <div
          className={`relative rounded-lg border-2 border-dashed transition-all ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border bg-secondary/30 hover:border-border/80'
          } ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
          style={aspectRatio ? { aspectRatio } : { minHeight: '140px' }}
          onDrop={handleDrop}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragActive(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => inputRef.current?.click()}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Convertendo e enviando...</p>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {placeholder || 'Clique ou arraste uma imagem'}
                  </p>
                  {helpText ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{helpText}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    PNG, JPG ou WebP. O arquivo final sempre sera publicado em WebP.
                  </p>
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
          />
        </div>
      )}

      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Os banners sao publicados em WebP para manter a home leve.</span>
      </div>
    </div>
  );
}
