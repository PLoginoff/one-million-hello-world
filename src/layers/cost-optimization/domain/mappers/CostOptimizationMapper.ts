/**
 * CostOptimizationMapper
 */

export interface CostOptimizationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface CostOptimizationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CostOptimizationMapper {
  toDto(entity: CostOptimizationEntityData): CostOptimizationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: CostOptimizationDto): CostOptimizationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: CostOptimizationEntityData[]): CostOptimizationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: CostOptimizationDto[]): CostOptimizationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: CostOptimizationEntityData, patch: Partial<CostOptimizationEntityData>): CostOptimizationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
