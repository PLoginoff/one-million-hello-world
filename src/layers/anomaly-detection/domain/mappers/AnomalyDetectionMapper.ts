/**
 * AnomalyDetectionMapper
 */

export interface AnomalyDetectionDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface AnomalyDetectionEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnomalyDetectionMapper {
  toDto(entity: AnomalyDetectionEntityData): AnomalyDetectionDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: AnomalyDetectionDto): AnomalyDetectionEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: AnomalyDetectionEntityData[]): AnomalyDetectionDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: AnomalyDetectionDto[]): AnomalyDetectionEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: AnomalyDetectionEntityData, patch: Partial<AnomalyDetectionEntityData>): AnomalyDetectionEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
