/**
 * ServiceDiscoveryMapper
 */

export interface ServiceDiscoveryDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface ServiceDiscoveryEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceDiscoveryMapper {
  toDto(entity: ServiceDiscoveryEntityData): ServiceDiscoveryDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: ServiceDiscoveryDto): ServiceDiscoveryEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: ServiceDiscoveryEntityData[]): ServiceDiscoveryDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: ServiceDiscoveryDto[]): ServiceDiscoveryEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: ServiceDiscoveryEntityData, patch: Partial<ServiceDiscoveryEntityData>): ServiceDiscoveryEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
