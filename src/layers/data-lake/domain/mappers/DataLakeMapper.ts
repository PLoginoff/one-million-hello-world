/**
 * DataLakeMapper
 */

export interface DataLakeDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DataLakeEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataLakeMapper {
  toDto(entity: DataLakeEntityData): DataLakeDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DataLakeDto): DataLakeEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DataLakeEntityData[]): DataLakeDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DataLakeDto[]): DataLakeEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DataLakeEntityData, patch: Partial<DataLakeEntityData>): DataLakeEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
