/**
 * PerformanceTestingMapper
 */

export interface PerformanceTestingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface PerformanceTestingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PerformanceTestingMapper {
  toDto(entity: PerformanceTestingEntityData): PerformanceTestingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: PerformanceTestingDto): PerformanceTestingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: PerformanceTestingEntityData[]): PerformanceTestingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: PerformanceTestingDto[]): PerformanceTestingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(
    base: PerformanceTestingEntityData,
    patch: Partial<PerformanceTestingEntityData>
  ): PerformanceTestingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
