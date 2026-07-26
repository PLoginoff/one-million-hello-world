/**
 * LocalizationMapper
 */

export interface LocalizationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface LocalizationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class LocalizationMapper {
  toDto(entity: LocalizationEntityData): LocalizationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: LocalizationDto): LocalizationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: LocalizationEntityData[]): LocalizationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: LocalizationDto[]): LocalizationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: LocalizationEntityData, patch: Partial<LocalizationEntityData>): LocalizationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
