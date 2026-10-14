'use client';

import { memo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Sliders } from 'lucide-react';
import type { FileType } from '@/lib/types';

interface SettingsCardProps {
  fileType: FileType;
  titleLength: number;
  descriptionLength: number;
  keywordsCount: number;
  extra: string;
  onFileTypeChange: (type: FileType) => void;
  onTitleLengthChange: (length: number) => void;
  onDescriptionLengthChange: (length: number) => void;
  onKeywordsCountChange: (count: number) => void;
  onExtraChange: (extra: string) => void;
}

function SettingsCardComponent({
  fileType,
  titleLength,
  descriptionLength,
  keywordsCount,
  extra,
  onFileTypeChange,
  onTitleLengthChange,
  onDescriptionLengthChange,
  onKeywordsCountChange,
  onExtraChange,
}: SettingsCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border-2 border-[#2c1810] shadow-[4px_4px_0_#2c1810] rounded-xl overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#fff5e6] hover:bg-[#ffebd1] border-b-2 border-[#2c1810] px-4 py-3 flex items-center justify-between text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 font-bold text-[#2c1810] text-sm">
          <Sliders className="w-4 h-4 text-[#ff6b35]" />
          <span>Pengaturan Format & SEO</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#6b5344]">
          <span>{open ? 'Tutup' : 'Ubah Format'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-bold text-[#6b5344] mb-1 block">
                Tipe Asset
              </Label>
              <Select value={fileType} onValueChange={(v) => onFileTypeChange(v as FileType)}>
                <SelectTrigger className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-10 shadow-[2px_2px_0_#2c1810]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-2 border-[#2c1810] text-[#2c1810] shadow-[4px_4px_0_#2c1810]">
                  <SelectItem value="auto">Auto (Deteksi Otomatis)</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="illustration">Illustration</SelectItem>
                  <SelectItem value="vector">Vector</SelectItem>
                  <SelectItem value="icon">Icon</SelectItem>
                  <SelectItem value="transparent_png">Transparent PNG</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider font-bold text-[#6b5344] mb-1 block">
                Target Keywords
              </Label>
              <Input
                type="number"
                min={5}
                max={50}
                value={keywordsCount}
                onChange={(e) => onKeywordsCountChange(parseInt(e.target.value || '35', 10))}
                className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-10 shadow-[2px_2px_0_#2c1810]"
              />
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider font-bold text-[#6b5344] mb-1 block">
                Maks Judul (Char)
              </Label>
              <Input
                type="number"
                min={20}
                max={200}
                value={titleLength}
                onChange={(e) => onTitleLengthChange(parseInt(e.target.value || '70', 10))}
                className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-10 shadow-[2px_2px_0_#2c1810]"
              />
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider font-bold text-[#6b5344] mb-1 block">
                Deskripsi (Kata)
              </Label>
              <Input
                type="number"
                min={10}
                max={200}
                value={descriptionLength}
                onChange={(e) => onDescriptionLengthChange(parseInt(e.target.value || '60', 10))}
                className="bg-white border-2 border-[#2c1810] text-[#2c1810] font-semibold h-10 shadow-[2px_2px_0_#2c1810]"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px] uppercase tracking-wider font-bold text-[#6b5344] mb-1 block">
              Instruksi Tambahan (Opsional)
            </Label>
            <Textarea
              rows={2}
              value={extra}
              onChange={(e) => onExtraChange(e.target.value)}
              placeholder="Contoh: Fokuskan keyword pada arsitektur minimalis modern..."
              className="bg-white border-2 border-[#2c1810] text-[#2c1810] text-xs shadow-[2px_2px_0_#2c1810]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const SettingsCard = memo(SettingsCardComponent);

