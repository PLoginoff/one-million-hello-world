/**
 * DataTransformationMapper
 */

export interface DataTransformationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DataTransformationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DataTransformationMapper {
  toDto(entity: DataTransformationEntityData): DataTransformationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DataTransformationDto): DataTransformationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DataTransformationEntityData[]): DataTransformationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DataTransformationDto[]): DataTransformationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(
    base: DataTransformationEntityData,
    patch: Partial<DataTransformationEntityData>
  ): DataTransformationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
