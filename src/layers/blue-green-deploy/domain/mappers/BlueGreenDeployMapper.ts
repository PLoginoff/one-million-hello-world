/**
 * BlueGreenDeployMapper
 */

export interface BlueGreenDeployDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface BlueGreenDeployEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BlueGreenDeployMapper {
  toDto(entity: BlueGreenDeployEntityData): BlueGreenDeployDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: BlueGreenDeployDto): BlueGreenDeployEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: BlueGreenDeployEntityData[]): BlueGreenDeployDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: BlueGreenDeployDto[]): BlueGreenDeployEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: BlueGreenDeployEntityData, patch: Partial<BlueGreenDeployEntityData>): BlueGreenDeployEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
