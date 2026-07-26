/**
 * DataLineageMapper
 */

export interface DataLineageDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DataLineageEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLineageMapper {
  toDto(entity: DataLineageEntityData): DataLineageDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DataLineageDto): DataLineageEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DataLineageEntityData[]): DataLineageDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DataLineageDto[]): DataLineageEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DataLineageEntityData, patch: Partial<DataLineageEntityData>): DataLineageEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
