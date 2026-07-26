/**
 * DataQualityMapper
 */

export interface DataQualityDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DataQualityEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataQualityMapper {
  toDto(entity: DataQualityEntityData): DataQualityDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DataQualityDto): DataQualityEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DataQualityEntityData[]): DataQualityDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DataQualityDto[]): DataQualityEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DataQualityEntityData, patch: Partial<DataQualityEntityData>): DataQualityEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
