/**
 * ServiceMeshMapper
 */

export interface ServiceMeshDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface ServiceMeshEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ServiceMeshMapper {
  toDto(entity: ServiceMeshEntityData): ServiceMeshDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: ServiceMeshDto): ServiceMeshEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: ServiceMeshEntityData[]): ServiceMeshDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: ServiceMeshDto[]): ServiceMeshEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: ServiceMeshEntityData, patch: Partial<ServiceMeshEntityData>): ServiceMeshEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
