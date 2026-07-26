/**
 * LoadBalancerMapper
 */

export interface LoadBalancerDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface LoadBalancerEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LoadBalancerMapper {
  toDto(entity: LoadBalancerEntityData): LoadBalancerDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: LoadBalancerDto): LoadBalancerEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: LoadBalancerEntityData[]): LoadBalancerDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: LoadBalancerDto[]): LoadBalancerEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: LoadBalancerEntityData, patch: Partial<LoadBalancerEntityData>): LoadBalancerEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
