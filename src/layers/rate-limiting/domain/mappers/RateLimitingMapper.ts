/**
 * RateLimitingMapper
 */

export interface RateLimitingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface RateLimitingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class RateLimitingMapper {
  toDto(entity: RateLimitingEntityData): RateLimitingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: RateLimitingDto): RateLimitingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: RateLimitingEntityData[]): RateLimitingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: RateLimitingDto[]): RateLimitingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: RateLimitingEntityData, patch: Partial<RateLimitingEntityData>): RateLimitingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
