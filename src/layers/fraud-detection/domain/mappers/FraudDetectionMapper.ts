/**
 * FraudDetectionMapper
 */

export interface FraudDetectionDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface FraudDetectionEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FraudDetectionMapper {
  toDto(entity: FraudDetectionEntityData): FraudDetectionDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: FraudDetectionDto): FraudDetectionEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: FraudDetectionEntityData[]): FraudDetectionDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: FraudDetectionDto[]): FraudDetectionEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: FraudDetectionEntityData, patch: Partial<FraudDetectionEntityData>): FraudDetectionEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
