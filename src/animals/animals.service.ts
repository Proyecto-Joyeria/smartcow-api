import Papa from 'papaparse';
import ExcelJS from 'exceljs';

import { AppError } from '@common/utils/app-error';
import { animalRepository } from '@animals/animals.repository';
import { CsvRowSchema } from '@animals/animals.schemas';
import type {
  Animal,
  AnimalDetail,
  AnimalSummary,
  CreateAnimalDto,
  UpdateAnimalDto,
  AnimalQueryDto,
  PaginatedResult,
  ImportResult,
  CsvImportRow,
  IAnimalService,
} from '@animals/animals.types';

// ── Columnas del CSV / XLSX de exportación ─────────────────────────────────────

const EXPORT_COLUMNS = [
  'id', 'code', 'name', 'breed', 'sex', 'areteNumber',
  'status', 'healthStatus', 'reproductiveStatus',
  'birthDate', 'weightKg', 'notes', 'createdAt',
] as const;

// ── AnimalService ──────────────────────────────────────────────────────────────

class AnimalService implements IAnimalService {

  async create(dto: CreateAnimalDto, farmId: string): Promise<Animal> {
    const existing = await animalRepository.findByCode(dto.code, farmId);
    if (existing) {
      throw new AppError(409, 'CONFLICT', `El código "${dto.code}" ya existe en esta finca`);
    }
    return animalRepository.create({ ...dto, farmId });
  }

  async findById(id: string, farmId: string): Promise<AnimalDetail> {
    const animal = await animalRepository.findById(id, farmId);
    if (!animal) {
      throw new AppError(404, 'NOT_FOUND', 'Animal no encontrado');
    }
    return animal;
  }

  async findAll(
    farmId: string,
    query:  AnimalQueryDto,
  ): Promise<PaginatedResult<AnimalSummary>> {
    return animalRepository.findAll(farmId, query);
  }

  async update(id: string, farmId: string, dto: UpdateAnimalDto): Promise<Animal> {
    const existing = await animalRepository.findById(id, farmId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Animal no encontrado');
    }
    return animalRepository.update(id, farmId, dto);
  }

  async softDelete(id: string, farmId: string): Promise<void> {
    const existing = await animalRepository.findById(id, farmId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Animal no encontrado');
    }
    await animalRepository.softDelete(id, farmId);
  }

  /**
   * Importación masiva desde CSV (multipart/form-data).
   *
   * Regla: si HAY cualquier error de validación → rechazar TODO el archivo.
   * Solo si TODAS las filas son válidas se insertan en BD.
   */
  async importFromCsv(buffer: Buffer, farmId: string): Promise<ImportResult> {
    const csvText = buffer.toString('utf-8');

    const parsed = Papa.parse<Record<string, unknown>>(csvText, {
      header:           true,
      skipEmptyLines:   true,
      transformHeader:  (h) => h.trim(),
      transform:        (v) => (typeof v === 'string' ? v.trim() : v),
    });

    if (parsed.data.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'El archivo CSV está vacío');
    }

    // ── Fase 1: validar todas las filas ────────────────────────────────────────
    const rowErrors: CsvImportRow[] = [];
    const validRows: Array<CreateAnimalDto & { farmId: string }> = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const rowNumber = i + 2; // fila 1 = headers
      const raw = parsed.data[i];
      if (raw === undefined) continue;

      const result = CsvRowSchema.safeParse(raw);

      if (!result.success) {
        rowErrors.push({
          rowNumber,
          code:   String(raw['code'] ?? ''),
          errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        });
      } else {
        validRows.push({ ...result.data, farmId });
      }
    }

    // Si hay errores → rechazar el archivo completo sin insertar nada
    if (rowErrors.length > 0) {
      return { imported: 0, errors: rowErrors };
    }

    // ── Fase 2: verificar duplicados de código dentro del archivo ──────────────
    const seenCodes = new Set<string>();
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      if (!row) continue;
      if (seenCodes.has(row.code)) {
        rowErrors.push({
          rowNumber: i + 2,
          code:      row.code,
          errors:    [`Código duplicado en el archivo: "${row.code}"`],
        });
      }
      seenCodes.add(row.code);
    }

    if (rowErrors.length > 0) {
      return { imported: 0, errors: rowErrors };
    }

    // ── Fase 3: verificar duplicados contra la BD ──────────────────────────────
    const dbChecks = await Promise.all(
      validRows.map(async (row, i) => {
        const exists = await animalRepository.findByCode(row.code, farmId);
        if (exists) {
          return {
            rowNumber: i + 2,
            code:      row.code,
            errors:    [`El código "${row.code}" ya existe en esta finca`],
          } satisfies CsvImportRow;
        }
        return null;
      }),
    );

    const dbErrors = dbChecks.filter((e): e is CsvImportRow => e !== null);
    if (dbErrors.length > 0) {
      return { imported: 0, errors: dbErrors };
    }

    // ── Fase 4: insertar todas las filas válidas ───────────────────────────────
    const count = await animalRepository.createMany(validRows);
    return { imported: count, errors: [] };
  }

  async exportToCsv(farmId: string): Promise<Buffer> {
    const animals = await animalRepository.findAllForExport(farmId);

    const rows = animals.map((a) => ({
      id:                 a.id,
      code:               a.code,
      name:               a.name ?? '',
      breed:              a.breed,
      sex:                a.sex,
      areteNumber:        a.areteNumber ?? '',
      status:             a.status,
      healthStatus:       a.healthStatus,
      reproductiveStatus: a.reproductiveStatus ?? '',
      birthDate:          a.birthDate ? a.birthDate.toISOString() : '',
      weightKg:           a.weightKg ?? '',
      notes:              a.notes ?? '',
      createdAt:          a.createdAt.toISOString(),
    }));

    const csv = Papa.unparse(rows, { columns: [...EXPORT_COLUMNS] });
    return Buffer.from(csv, 'utf-8');
  }

  async exportToXlsx(farmId: string): Promise<Buffer> {
    const animals = await animalRepository.findAllForExport(farmId);

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Animales');

    worksheet.columns = [
      { header: 'ID',                  key: 'id',                 width: 32 },
      { header: 'Código',              key: 'code',               width: 15 },
      { header: 'Nombre',              key: 'name',               width: 20 },
      { header: 'Raza',                key: 'breed',              width: 12 },
      { header: 'Sexo',                key: 'sex',                width: 8  },
      { header: 'Arete',               key: 'areteNumber',        width: 15 },
      { header: 'Estado',              key: 'status',             width: 14 },
      { header: 'Salud',               key: 'healthStatus',       width: 18 },
      { header: 'Reproductivo',        key: 'reproductiveStatus', width: 15 },
      { header: 'Fecha nacimiento',    key: 'birthDate',          width: 20 },
      { header: 'Peso (kg)',           key: 'weightKg',           width: 12 },
      { header: 'Notas',               key: 'notes',              width: 30 },
      { header: 'Creado',              key: 'createdAt',          width: 20 },
    ];

    // Estilo encabezado
    const headerRow = worksheet.getRow(1);
    headerRow.font   = { bold: true };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
    headerRow.commit();

    for (const a of animals) {
      worksheet.addRow({
        id:                 a.id,
        code:               a.code,
        name:               a.name ?? '',
        breed:              a.breed,
        sex:                a.sex,
        areteNumber:        a.areteNumber ?? '',
        status:             a.status,
        healthStatus:       a.healthStatus,
        reproductiveStatus: a.reproductiveStatus ?? '',
        birthDate:          a.birthDate ? a.birthDate.toISOString().split('T')[0] : '',
        weightKg:           a.weightKg ?? '',
        notes:              a.notes ?? '',
        createdAt:          a.createdAt.toISOString(),
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export const animalService = new AnimalService();
