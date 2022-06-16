"""
IMPORTANT NOTE: This file is NOT meant to be a comprehensive sqlalchemy ORM version of the BHIMS database.
It is only used to define relationships between tables important for data exportation.
"""

from sqlalchemy import Column, ForeignKey, INTEGER
from sqlalchemy.ext.declarative import as_declarative
from sqlalchemy.orm import relationship


# -------- BASE -------- #

@as_declarative()
class Base:
    id = Column(INTEGER, primary_key=True)

Base.metadata.schema = 'public'

model_dict = lambda: {mapper.class_.__tablename__: mapper.class_ for mapper in Base.registry.mappers}


class CodeMixin:
    code = Column(INTEGER)


# -------- CODED TABLES -------- #

class BackcountryUnitCode(Base, CodeMixin):
    __tablename__ = 'backcountry_unit_codes'


class BearCohortCode(Base, CodeMixin):
    __tablename__ = 'bear_cohort_codes'


class BearColorCode(Base, CodeMixin):
    __tablename__ = 'bear_color_codes'


class BearInjuryCode(Base, CodeMixin):
    __tablename__ = 'bear_injury_codes'


class BearSpeciesCode(Base, CodeMixin):
    __tablename__ = 'bear_species_codes'


class BooleanResponseCode(Base, CodeMixin):
    __tablename__ = 'boolean_response_codes'


class CountryCode(Base, CodeMixin):
    __tablename__ = 'country_codes'


class DatumCode(Base, CodeMixin):
    __tablename__ = 'datum_codes'


class DeterrentTypeCode(Base, CodeMixin):
    __tablename__ = 'deterrent_type_codes'


class FileTypeCode(Base, CodeMixin):
    __tablename__ = 'file_type_codes'


class FoodPresentCode(Base, CodeMixin):
    __tablename__ = 'food_present_codes'


class GeneralHumanActivityCode(Base, CodeMixin):
    __tablename__ = 'general_human_activity_codes'


class HabitatTypeCode(Base, CodeMixin):
    __tablename__ = 'habitat_type_codes'


class HumanGroupTypeCode(Base, CodeMixin):
    __tablename__ = 'human_group_type_codes'


class InitialBearActionCode(Base, CodeMixin):
    __tablename__ = 'initial_bear_action_codes'


class InitialHumanActionCode(Base, CodeMixin):
    __tablename__ = 'initial_human_action_codes'


class LocationAccuracyCode(Base, CodeMixin):
    __tablename__ = 'location_accuracy_codes'


class ManagementActionCode(Base, CodeMixin):
    __tablename__ = 'management_action_codes'


class ManagementClassificationCode(Base, CodeMixin):
    __tablename__ = 'management_classification_codes'


class PlaceNameCode(Base, CodeMixin):
    __tablename__ = 'place_name_codes'


class ProbableCauseCode(Base, CodeMixin):
    __tablename__ = 'probable_cause_codes'


class ReactionCode(Base, CodeMixin):
    __tablename__ = 'reaction_codes'


class ReportedProbableCause(Base, CodeMixin):
    __tablename__ = 'reported_probable_cause_codes'


class RoadNameCode(Base, CodeMixin):
    __tablename__ = 'road_name_codes'


class SexCode(Base, CodeMixin):
    __tablename__ = 'sex_codes'


class StructureInteractionCode(Base, CodeMixin):
    __tablename__ = 'structure_interaction_codes'


class StructureTypeCode(Base, CodeMixin):
    __tablename__ = 'structure_type_codes'


class VisibilityCode(Base, CodeMixin):
    __tablename__ = 'visibility_codes'


# -------- QUERIED TABLES -------- #

class Assessment(Base):
    __tablename__ = 'assessment'

    management_action_code = Column(INTEGER, ForeignKey(ManagementActionCode.code))
    management_classification_code = Column(INTEGER, ForeignKey(ManagementClassificationCode.code))
    probable_cause_code = Column(INTEGER, ForeignKey(ProbableCauseCode.code))

    management_action = relationship(ManagementActionCode, lazy='joined')
    management_classification = relationship(ManagementClassificationCode, lazy='joined')
    probable_cause = relationship(ProbableCauseCode, lazy='joined')


class Attachment(Base):
    __tablename__ = 'attachments'

    file_type_code = Column(INTEGER, ForeignKey(FileTypeCode.code))

    file_type = relationship(FileTypeCode, lazy='joined')


class Bear(Base):
    __tablename__ = 'bears'

    bear_species_code = Column(INTEGER, ForeignKey(BearSpeciesCode.code))
    bear_sex_code = Column(INTEGER, ForeignKey(SexCode.code))
    bear_color_code = Column(INTEGER, ForeignKey(BearColorCode.code))
    bear_injury_code = Column(INTEGER, ForeignKey(BearInjuryCode.code))
    previously_encountered = Column(INTEGER, ForeignKey(BooleanResponseCode.code))

    bear_species = relationship(BearSpeciesCode, lazy='joined')
    bear_sex = relationship(SexCode, lazy='joined')
    bear_color = relationship(BearColorCode, lazy='joined')
    bear_injury = relationship(BearInjuryCode, lazy='joined')
    prev_encounter = relationship(BooleanResponseCode, lazy='joined')


class Deterrent(Base):
    __tablename__ = 'deterrents_used'

    deterrent_type_code = Column(INTEGER, ForeignKey(DeterrentTypeCode.code))

    deterrent = relationship(DeterrentTypeCode, lazy='joined')


class EncounterLocation(Base):
    __tablename__ = 'encounter_locations'

    backcountry_unit_code = Column(INTEGER, ForeignKey(BackcountryUnitCode.code))
    datum_code = Column(INTEGER, ForeignKey(DatumCode.code))
    habitat_type_code = Column(INTEGER, ForeignKey(HabitatTypeCode.code))
    location_accuracy_code = Column(INTEGER, ForeignKey(LocationAccuracyCode.code))
    place_name_code = Column(INTEGER, ForeignKey(PlaceNameCode.code))
    road_name_code = Column(INTEGER, ForeignKey(RoadNameCode.code))
    visibility_code = Column(INTEGER, ForeignKey(VisibilityCode.code))

    backcountry_unit = relationship(BackcountryUnitCode, lazy='joined')
    datum = relationship(DatumCode, lazy='joined')
    habitat_type = relationship(HabitatTypeCode, lazy='joined')
    location_accuracy = relationship(LocationAccuracyCode, lazy='joined')
    place_name = relationship(PlaceNameCode, lazy='joined')
    road_name = relationship(RoadNameCode, lazy='joined')
    visibility = relationship(VisibilityCode, lazy='joined')


class Encounter(Base):
    __tablename__ = 'encounters'

    bear_charged = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_cohort_code = Column(INTEGER, ForeignKey(BearCohortCode.code))
    bear_obtained_food = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_spray_was_effective = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_spray_used = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    food_present_code = Column(INTEGER, ForeignKey(FoodPresentCode.code))
    general_human_activity_code = Column(INTEGER, ForeignKey(GeneralHumanActivityCode.code))
    human_group_type_code = Column(INTEGER, ForeignKey(HumanGroupTypeCode.code))
    initial_bear_action_code = Column(INTEGER, ForeignKey(InitialBearActionCode.code))
    initial_human_action_code = Column(INTEGER, ForeignKey(InitialHumanActionCode.code))
    reported_probable_cause_code = Column(INTEGER, ForeignKey(ReportedProbableCause.code))
    was_making_noise = Column(INTEGER, ForeignKey(BooleanResponseCode.code))

    # NOTE: foreign_key args required because BooleanResponseCode is foreign keyed to multiple columns creating
    #  relationship ambiguity. https://docs.sqlalchemy.org/en/14/orm/join_conditions.html
    charged = relationship(BooleanResponseCode, foreign_keys=[bear_charged], lazy='joined')
    bear_cohort = relationship(BearCohortCode, lazy='joined')
    food_obtained = relationship(BooleanResponseCode, foreign_keys=[bear_obtained_food], lazy='joined')
    bear_spray_effective = relationship(BooleanResponseCode, foreign_keys=[bear_spray_was_effective], lazy='joined')
    used_bear_spray = relationship(BooleanResponseCode, foreign_keys=[bear_spray_used], lazy='joined')
    food = relationship(FoodPresentCode, lazy='joined')
    general_human_activity = relationship(GeneralHumanActivityCode, lazy='joined')
    human_group_type = relationship(HumanGroupTypeCode, lazy='joined')
    initial_bear_action = relationship(InitialBearActionCode, lazy='joined')
    initial_human_action = relationship(InitialHumanActionCode, lazy='joined')
    reported_probable_cause = relationship(ReportedProbableCause, lazy='joined')
    made_noise = relationship(BooleanResponseCode, foreign_keys=[was_making_noise], lazy='joined')


class People(Base):
    __tablename__ = 'people'

    country_code = Column(INTEGER, ForeignKey(CountryCode.code))

    country = relationship(CountryCode, lazy='joined')


class PropertyDamage(Base):
    __tablename__ = 'property_damage'


class Reaction(Base):
    __tablename__ = 'reactions'

    reaction_code = Column(INTEGER, ForeignKey(ReactionCode.code))

    reaction = relationship(ReactionCode, lazy='joined')


class StructureInteraction(Base):
    __tablename__ = 'structure_interactions'

    structure_interaction_code = Column(INTEGER, ForeignKey(StructureInteractionCode.code))
    structure_type_code = Column(INTEGER, ForeignKey(StructureTypeCode.code))

    structure_type = relationship(StructureTypeCode, lazy='joined')
    structure_interaction = relationship(StructureInteractionCode, lazy='joined')
