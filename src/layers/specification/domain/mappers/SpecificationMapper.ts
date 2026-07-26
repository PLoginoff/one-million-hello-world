/**
 * SpecificationMapper
 */

export interface SpecificationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SpecificationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SpecificationMapper {
  toDto(entity: SpecificationEntityData): SpecificationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SpecificationDto): SpecificationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SpecificationEntityData[]): SpecificationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SpecificationDto[]): SpecificationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SpecificationEntityData, patch: Partial<SpecificationEntityData>): SpecificationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
