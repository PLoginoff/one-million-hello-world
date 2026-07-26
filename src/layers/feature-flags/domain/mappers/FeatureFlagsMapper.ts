/**
 * FeatureFlagsMapper
 */

export interface FeatureFlagsDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface FeatureFlagsEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FeatureFlagsMapper {
  toDto(entity: FeatureFlagsEntityData): FeatureFlagsDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: FeatureFlagsDto): FeatureFlagsEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: FeatureFlagsEntityData[]): FeatureFlagsDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: FeatureFlagsDto[]): FeatureFlagsEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: FeatureFlagsEntityData, patch: Partial<FeatureFlagsEntityData>): FeatureFlagsEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
