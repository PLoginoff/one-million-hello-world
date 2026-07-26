/**
 * StrategyMapper
 */

export interface StrategyDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface StrategyEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class StrategyMapper {
  toDto(entity: StrategyEntityData): StrategyDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: StrategyDto): StrategyEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: StrategyEntityData[]): StrategyDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: StrategyDto[]): StrategyEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: StrategyEntityData, patch: Partial<StrategyEntityData>): StrategyEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
