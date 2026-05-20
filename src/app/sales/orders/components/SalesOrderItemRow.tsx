"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";

export type OrderItem = {
  id: number;
  name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  discountValue: number;
  width?: number | null;
  length?: number | null;
  grammage?: number | null;
  diameter?: number | null;
  tube?: number | null;
  inventoryItem?: any;
  creases?: Record<string, number> | null;
  clientOrderNumber?: string | null;
  clientOrderItemNumber?: number | null;
  itemDeliveryDate?: string | Date | null;
  internalResin?: boolean;
  externalResin?: boolean;
};

const ItemThumb = ({ sku }: { sku?: string | null }) => {
  const s = String(sku || '').trim();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  if (!s || failed) {
    return <div className="w-10 h-10 border rounded bg-white" />;
  }
  const src = `/api/items/sku/${encodeURIComponent(s)}/thumbnail`;
  return (
    <>
      <button
        type="button"
        title="Aumentar Foto"
        className="group relative w-10 h-10 border rounded bg-white overflow-hidden cursor-zoom-in"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
        <div className="absolute bottom-0 right-0 m-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-0.5 rounded bg-white/90 border text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5">
              <circle cx="11" cy="11" r="7" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M11 8v6" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M8 11h6" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded shadow-lg max-w-[95vw] max-h-[95vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b flex items-center gap-2">
              <div className="text-sm font-medium">Foto</div>
              <button
                type="button"
                className="ml-auto px-2 py-1 text-sm border rounded hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>
            <div className="p-3">
              <img src={src} alt="" className="max-w-none" />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

export function supportsSheetDims(it: OrderItem): boolean {
  const fam = (it.inventoryItem?.commercialFamily?.name || '').toUpperCase();
  const name = (it.name || '').toUpperCase();
  if (fam.includes('CHAPA') || fam.includes('CHAPAS')) return true;
  if (name.includes('CHAPA') || name.includes('CHAPAS')) return true;
  return (it.width != null) || (it.length != null) || (it.grammage != null);
}

export function supportsCoreDims(it: OrderItem): boolean {
  const fam = (it.inventoryItem?.commercialFamily?.name || '').toUpperCase();
  if (fam.includes('MIOLO')) return true;
  if (fam.includes('PAPEL') && !fam.includes('PAPELAO')) return true;
  return false;
}

const FormattedIntInput = ({ 
  value, 
  onChange, 
  disabled, 
  className,
  placeholder 
}: { 
  value?: number | null, 
  onChange: (val: number | null) => void, 
  disabled?: boolean, 
  className?: string,
  placeholder?: string
}) => {
  const [str, setStr] = useState(value !== undefined && value !== null ? value.toLocaleString('pt-BR') : '');

  useEffect(() => {
    if (value === undefined || value === null) {
      if (str !== '') setStr('');
    } else {
        const currentInt = parseInt(str.replace(/\./g, ''), 10);
        if (isNaN(currentInt) || currentInt !== value) {
            setStr(value.toLocaleString('pt-BR'));
        }
    }
  }, [value, str]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '');
    
    if (digits === '') {
      setStr('');
      onChange(null);
      return;
    }

    const intVal = parseInt(digits, 10);
    const formatted = intVal.toLocaleString('pt-BR');
    
    setStr(formatted);
    onChange(intVal);
  };

  return (
    <input
      type="text"
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      value={str}
      onChange={handleChange}
    />
  );
};

interface SalesOrderItemRowProps {
  item: OrderItem;
  isOrderEditable: boolean;
  onPreviewUpdate: (updated: OrderItem) => void;
  onSaveSuccess?: () => void; // Optional for local mode
  onAutoSave?: (updated: OrderItem) => Promise<void>; // Optional custom saver
  onDelete: () => void;
  showFeatures: boolean;
  toggleFeatures: () => void;
  computeWeightKg: (it: OrderItem) => number;
  fmtInt: (n?: number) => string;
  hasCoreCol: boolean;
  canDelete: boolean;
}

export const SalesOrderItemRow = ({
  item,
  isOrderEditable,
  onPreviewUpdate,
  onSaveSuccess,
  onAutoSave,
  onDelete,
  computeWeightKg,
  fmtInt,
  hasCoreCol,
  canDelete
}: SalesOrderItemRowProps) => {
  const [localItem, setLocalItem] = useState<OrderItem>(item);
  const [discountInput, setDiscountInput] = useState(
    item.discountPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [discountValueInput, setDiscountValueInput] = useState(
    (item.discountValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRowLocked, setIsRowLocked] = useState(false);
  const priceTable = localItem?.inventoryItem?.priceTable ?? null;
  const priceTableLabel =
    priceTable && typeof priceTable === 'object'
      ? String((priceTable as any)?.nrtabpre || (priceTable as any)?.descricao || '').trim()
      : '';
  const priceTableTitle =
    priceTable && typeof priceTable === 'object'
      ? String((priceTable as any)?.descricao || (priceTable as any)?.nrtabpre || '').trim()
      : '';

  useEffect(() => {
    setLocalItem(prev => {
      if (JSON.stringify(prev) !== JSON.stringify(item)) {
        if (prev.discountPct !== item.discountPct) {
            setDiscountInput(item.discountPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        if (prev.discountValue !== item.discountValue) {
            setDiscountValueInput((item.discountValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        return item;
      }
      return prev;
    });
  }, [item]);

  const saveItem = async (data: Partial<OrderItem>) => {
    if (!onAutoSave) return; // Local mode only
    
    setIsSaving(true);
    try {
      // Merge with current localItem to ensure full object is passed if needed, 
      // but onAutoSave usually expects the full object or delta.
      // Here we assume onAutoSave takes the updated object.
      await onAutoSave({ ...localItem, ...data });
      if (onSaveSuccess) onSaveSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const debouncedSave = useDebouncedCallback(saveItem, 1000);

  const handleChange = (field: keyof OrderItem, value: any) => {
    const updated = { ...localItem, [field]: value };
    setLocalItem(updated);
    onPreviewUpdate(updated); // Immediate update for UI/Calculations
    if (onAutoSave) {
        debouncedSave(updated); // Delayed save for API
    }
  };

  const handleDiscountChange = (val: string) => {
    const filtered = val.replace(/[^0-9,]/g, '');
    const parts = filtered.split(',');
    const clean = parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join('') : '');
    setDiscountInput(clean);
    
    const num = parseFloat(clean.replace(',', '.'));
    const validNum = isNaN(num) ? 0 : num;
    
    handleChange('discountPct', validNum);
  };

  const handleDiscountValueChange = (val: string) => {
    const filtered = val.replace(/[^0-9,]/g, '');
    const parts = filtered.split(',');
    const clean = parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join('') : '');
    setDiscountValueInput(clean);
    
    const num = parseFloat(clean.replace(',', '.'));
    const validNum = isNaN(num) ? 0 : num;
    
    handleChange('discountValue', validNum);
  };

  const showDiameterTube = supportsCoreDims(localItem);
  const canEdit = isOrderEditable && !isRowLocked;
  const disabledClass = "bg-gray-100 text-gray-500";
  const lockToggleDisabled = !isOrderEditable || isSaving;
  const isEffectivelyLocked = !isOrderEditable || isRowLocked;
  const thumbSku = localItem.sku || localItem.inventoryItem?.sku;

  return (
    <>
      <tr className={`border-t ${isSaving ? 'bg-blue-50' : ''}`}>
        <td className="p-2 align-top">
            <div className="flex items-center gap-3">
                <ItemThumb sku={thumbSku} />
                <div className="flex flex-col min-w-0">
                <span className="whitespace-normal break-words leading-tight">{localItem.name}</span>
                {isSaving && <span className="text-[10px] text-blue-600 animate-pulse">Salvando...</span>}
                </div>
            </div>
        </td>
        <td className="p-2">{localItem.sku || '-'}</td>
        <td className="p-2">{localItem.unit || '-'}</td>
        <td className="p-2" title={priceTableTitle || undefined}>
          {priceTableLabel || '-'}
        </td>
        
        {hasCoreCol && (
            <>
                <td className="p-2">{showDiameterTube ? (
                    <input 
                        type="number" step="1" 
                        className={`w-24 px-2 py-1 border rounded ${!canEdit ? disabledClass : ''}`}
                        disabled={!canEdit}
                        value={localItem.diameter ?? ''} 
                        onChange={(e) => handleChange('diameter', e.target.value ? parseInt(e.target.value, 10) : null)} 
                    />
                ) : '-'}</td>
                <td className="p-2">{showDiameterTube ? (
                    <input 
                        type="number" step="1" 
                        className={`w-24 px-2 py-1 border rounded ${!canEdit ? disabledClass : ''}`}
                        disabled={!canEdit}
                        value={localItem.tube ?? ''} 
                        onChange={(e) => handleChange('tube', e.target.value ? parseInt(e.target.value, 10) : null)} 
                    />
                ) : '-'}</td>
            </>
        )}

        <td className="p-2">
            <FormattedIntInput 
                className={`w-20 px-2 py-1 border rounded ${!canEdit ? disabledClass : ''}`}
                disabled={!canEdit}
                value={localItem.quantity} 
                onChange={(val) => handleChange('quantity', val ?? 0)} 
            />
        </td>
        <td className="p-2">
            <input 
                type="text" 
                className={`w-24 px-2 py-1 border rounded ${disabledClass}`}
                disabled
                value={fmtInt(computeWeightKg(localItem))} 
            />
        </td>
        <td className="p-2">
            <input 
                type="text" 
                className="w-24 px-2 py-1 border rounded bg-gray-100 text-gray-600 cursor-not-allowed" 
                value={(localItem.unitPrice ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                disabled 
            />
        </td>
        <td className="p-2">
            <input 
                type="text" 
                className={`w-20 px-2 py-1 border rounded ${!canEdit ? disabledClass : ''}`}
                disabled={!canEdit}
                value={discountInput} 
                onChange={(e) => handleDiscountChange(e.target.value)} 
            />
        </td>
        <td className="p-2">
            <input 
                type="text" 
                className={`w-24 px-2 py-1 border rounded ${!canEdit ? disabledClass : ''}`}
                disabled={!canEdit}
                value={discountValueInput} 
                onChange={(e) => handleDiscountValueChange(e.target.value)} 
            />
        </td>
        <td className="p-2">
            <div className="flex items-center justify-center gap-2">
                <button
                  className={`inline-flex items-center justify-center w-8 h-8 border rounded shadow-sm ${isEffectivelyLocked ? 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700' : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'} ${lockToggleDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={isEffectivelyLocked ? 'Editar item' : 'Salvar item'}
                  aria-label={isEffectivelyLocked ? 'Editar item' : 'Salvar item'}
                  disabled={lockToggleDisabled}
                  style={{ opacity: lockToggleDisabled ? 0.5 : 1, pointerEvents: lockToggleDisabled ? 'none' : 'auto' }}
                  onClick={() => {
                    if (lockToggleDisabled) return;
                    setIsRowLocked((prev) => !prev);
                  }}
                >
                  {isEffectivelyLocked ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>
                  )}
                </button>
                <button className={`inline-flex items-center justify-center w-8 h-8 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-gray-700 ${!canDelete ? 'opacity-50 cursor-not-allowed' : ''}`} title="Excluir" disabled={!canDelete} style={{ opacity: !canDelete ? 0.5 : 1, pointerEvents: !canDelete ? 'none' : 'auto' }} onClick={onDelete}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </td>
      </tr>
    </>
  );
};

export const SalesOrderItemCard = ({
  item,
  isOrderEditable,
  onPreviewUpdate,
  onSaveSuccess,
  onAutoSave,
  onDelete,
  computeWeightKg,
  fmtInt,
  hasCoreCol,
  canDelete
}: SalesOrderItemRowProps) => {
  const [localItem, setLocalItem] = useState<OrderItem>(item);
  const [discountInput, setDiscountInput] = useState(
    item.discountPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [discountValueInput, setDiscountValueInput] = useState(
    (item.discountValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRowLocked, setIsRowLocked] = useState(false);
  const priceTable = localItem?.inventoryItem?.priceTable ?? null;
  const priceTableLabel =
    priceTable && typeof priceTable === 'object'
      ? String((priceTable as any)?.nrtabpre || (priceTable as any)?.descricao || '').trim()
      : '';
  const priceTableTitle =
    priceTable && typeof priceTable === 'object'
      ? String((priceTable as any)?.descricao || (priceTable as any)?.nrtabpre || '').trim()
      : '';

  useEffect(() => {
    setLocalItem(prev => {
      if (JSON.stringify(prev) !== JSON.stringify(item)) {
        if (prev.discountPct !== item.discountPct) {
            setDiscountInput(item.discountPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        if (prev.discountValue !== item.discountValue) {
            setDiscountValueInput((item.discountValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        return item;
      }
      return prev;
    });
  }, [item]);

  const saveItem = async (data: Partial<OrderItem>) => {
    if (!onAutoSave) return;
    
    setIsSaving(true);
    try {
      await onAutoSave({ ...localItem, ...data });
      if (onSaveSuccess) onSaveSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const debouncedSave = useDebouncedCallback(saveItem, 1000);

  const handleChange = (field: keyof OrderItem, value: any) => {
    const updated = { ...localItem, [field]: value };
    setLocalItem(updated);
    onPreviewUpdate(updated);
    if (onAutoSave) {
        debouncedSave(updated);
    }
  };

  const handleDiscountChange = (val: string) => {
    const filtered = val.replace(/[^0-9,]/g, '');
    const parts = filtered.split(',');
    const clean = parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join('') : '');
    setDiscountInput(clean);
    
    const num = parseFloat(clean.replace(',', '.'));
    const validNum = isNaN(num) ? 0 : num;
    
    handleChange('discountPct', validNum);
  };

  const handleDiscountValueChange = (val: string) => {
    const filtered = val.replace(/[^0-9,]/g, '');
    const parts = filtered.split(',');
    const clean = parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join('') : '');
    setDiscountValueInput(clean);
    
    const num = parseFloat(clean.replace(',', '.'));
    const validNum = isNaN(num) ? 0 : num;
    
    handleChange('discountValue', validNum);
  };

  const showDiameterTube = supportsCoreDims(localItem);
  const canEdit = isOrderEditable && !isRowLocked;
  const disabledClass = "bg-gray-100 text-gray-500";
  const lockToggleDisabled = !isOrderEditable || isSaving;
  const isEffectivelyLocked = !isOrderEditable || isRowLocked;
  const thumbSku = localItem.sku || localItem.inventoryItem?.sku;

  return (
    <div className={`p-3 ${isSaving ? 'bg-blue-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <ItemThumb sku={thumbSku} />
          <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{localItem.name}</div>
          <div className="text-xs text-gray-600 truncate" title={priceTableTitle || undefined}>
            {localItem.sku || '-'} • {localItem.unit || '-'}{priceTableLabel ? ' • ' : ''}
            {priceTableLabel || ''}
          </div>
          {isSaving && <div className="text-[10px] text-blue-600 animate-pulse">Salvando...</div>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            className={`inline-flex items-center justify-center w-8 h-8 border rounded shadow-sm ${isEffectivelyLocked ? 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700' : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'} ${lockToggleDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isEffectivelyLocked ? 'Editar item' : 'Salvar item'}
            aria-label={isEffectivelyLocked ? 'Editar item' : 'Salvar item'}
            disabled={lockToggleDisabled}
            style={{ opacity: lockToggleDisabled ? 0.5 : 1, pointerEvents: lockToggleDisabled ? 'none' : 'auto' }}
            onClick={() => {
              if (lockToggleDisabled) return;
              setIsRowLocked((prev) => !prev);
            }}
          >
            {isEffectivelyLocked ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>
            )}
          </button>
          <button
            className={`inline-flex items-center justify-center w-8 h-8 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-gray-700 ${!canDelete ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Excluir"
            aria-label="Excluir"
            disabled={!canDelete}
            style={{ opacity: !canDelete ? 0.5 : 1, pointerEvents: !canDelete ? 'none' : 'auto' }}
            onClick={onDelete}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[11px] text-gray-600">Qtd</div>
          <FormattedIntInput 
            className={`w-full px-2 py-1 border rounded text-sm ${!canEdit ? disabledClass : ''}`}
            disabled={!canEdit}
            value={localItem.quantity} 
            onChange={(val) => handleChange('quantity', val ?? 0)} 
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-600">Peso (KG)</div>
          <input 
            type="text"
            className={`w-full px-2 py-1 border rounded text-sm ${disabledClass}`}
            disabled
            value={fmtInt(computeWeightKg(localItem))} 
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-600">Preço</div>
          <input
            type="text"
            className="w-full px-2 py-1 border rounded text-sm bg-gray-100 text-gray-600 cursor-not-allowed"
            value={(localItem.unitPrice ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            disabled
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-600">Desc (%)</div>
          <input
            type="text"
            className={`w-full px-2 py-1 border rounded text-sm ${!canEdit ? disabledClass : ''}`}
            disabled={!canEdit}
            value={discountInput}
            onChange={(e) => handleDiscountChange(e.target.value)}
          />
        </div>
        <div>
          <div className="text-[11px] text-gray-600">Desc (R$)</div>
          <input
            type="text"
            className={`w-full px-2 py-1 border rounded text-sm ${!canEdit ? disabledClass : ''}`}
            disabled={!canEdit}
            value={discountValueInput}
            onChange={(e) => handleDiscountValueChange(e.target.value)}
          />
        </div>
        {hasCoreCol && showDiameterTube && (
          <>
            <div>
              <div className="text-[11px] text-gray-600">Diâmetro</div>
              <input 
                type="number" step="1"
                className={`w-full px-2 py-1 border rounded text-sm ${!canEdit ? disabledClass : ''}`}
                disabled={!canEdit}
                value={localItem.diameter ?? ''} 
                onChange={(e) => handleChange('diameter', e.target.value ? parseInt(e.target.value, 10) : null)} 
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-600">Tubete</div>
              <input 
                type="number" step="1"
                className={`w-full px-2 py-1 border rounded text-sm ${!canEdit ? disabledClass : ''}`}
                disabled={!canEdit}
                value={localItem.tube ?? ''} 
                onChange={(e) => handleChange('tube', e.target.value ? parseInt(e.target.value, 10) : null)} 
              />
            </div>
          </>
        )}
      </div>

    </div>
  );
};
