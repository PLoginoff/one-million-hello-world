/**
 * SnapshotMapper
 */

export interface SnapshotDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SnapshotEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SnapshotMapper {
  toDto(entity: SnapshotEntityData): SnapshotDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SnapshotDto): SnapshotEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SnapshotEntityData[]): SnapshotDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SnapshotDto[]): SnapshotEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SnapshotEntityData, patch: Partial<SnapshotEntityData>): SnapshotEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
