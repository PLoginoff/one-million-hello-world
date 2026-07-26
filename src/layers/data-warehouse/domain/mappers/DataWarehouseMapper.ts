/**
 * DataWarehouseMapper
 */

export interface DataWarehouseDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DataWarehouseEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataWarehouseMapper {
  toDto(entity: DataWarehouseEntityData): DataWarehouseDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DataWarehouseDto): DataWarehouseEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DataWarehouseEntityData[]): DataWarehouseDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DataWarehouseDto[]): DataWarehouseEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DataWarehouseEntityData, patch: Partial<DataWarehouseEntityData>): DataWarehouseEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
