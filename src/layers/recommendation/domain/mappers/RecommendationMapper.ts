/**
 * RecommendationMapper
 */

export interface RecommendationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface RecommendationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RecommendationMapper {
  toDto(entity: RecommendationEntityData): RecommendationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: RecommendationDto): RecommendationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: RecommendationEntityData[]): RecommendationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: RecommendationDto[]): RecommendationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: RecommendationEntityData, patch: Partial<RecommendationEntityData>): RecommendationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
