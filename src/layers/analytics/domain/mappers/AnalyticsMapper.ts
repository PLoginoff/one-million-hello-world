/**
 * AnalyticsMapper
 */

export interface AnalyticsDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface AnalyticsEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class AnalyticsMapper {
  toDto(entity: AnalyticsEntityData): AnalyticsDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: AnalyticsDto): AnalyticsEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: AnalyticsEntityData[]): AnalyticsDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: AnalyticsDto[]): AnalyticsEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: AnalyticsEntityData, patch: Partial<AnalyticsEntityData>): AnalyticsEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
