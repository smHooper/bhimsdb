"""
Database Models for SQLAlchemy ORM mapping
"""

from sqlalchemy import Column, ForeignKey, INTEGER, VARCHAR, CHAR, NUMERIC
from sqlalchemy.dialects.postgresql import TEXT, DATE, TIME, TIMESTAMP
from sqlalchemy.ext.declarative import as_declarative
from sqlalchemy.orm import relationship, declared_attr, backref


# -------- BASE -------- #

@as_declarative()
class Base:
    id = Column(INTEGER, primary_key=True)

#Base.metadata.schema = 'public'

model_dict = lambda: {mapper.class_.__tablename__: mapper.class_ for mapper in Base.registry.mappers}


class CodeMixin:
    code = Column(INTEGER, nullable=False, unique=True)
    name = Column(VARCHAR(50))
    sort_order = Column(INTEGER)

# -------- CODED TABLES -------- #

class BackcountryUnitCode(Base, CodeMixin):
    __tablename__ = 'backcountry_unit_codes'

    latitude = Column(NUMERIC(10, 7))
    longitude = Column(NUMERIC(10, 7))


class BearAgeCode(Base, CodeMixin):
    __tablename__ = 'bear_age_codes'


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


class DataEntryStatusCode(Base, CodeMixin):
    __tablename__ = 'data_entry_status_codes'


class DataQualityCode(Base, CodeMixin):
    __tablename__ = 'data_quality_codes'


class DatumCode(Base, CodeMixin):
    __tablename__ = 'datum_codes'


class DaylightCode(Base, CodeMixin):
    __tablename__ = 'daylight_codes'


class DurationCode(Base, CodeMixin):
    __tablename__ = 'duration_codes'


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


class ImproperReactionCode(Base, CodeMixin):
    __tablename__ = 'improper_reaction_codes'


class InitialBearActionCode(Base, CodeMixin):
    __tablename__ = 'initial_bear_action_codes'


class InitialHumanActionCode(Base, CodeMixin):
    __tablename__ = 'initial_human_action_codes'


class HumanInjuryCode(Base, CodeMixin):
    __tablename__ = 'human_injury_codes'


class LocationAccuracyCode(Base, CodeMixin):
    __tablename__ = 'location_accuracy_codes'


class LocationSourceCode(Base, CodeMixin):
    __tablename__ = 'location_source_codes'


class MakingNoiseCode(Base, CodeMixin):
    __tablename__ = 'making_noise_codes'


class ManagementActionCode(Base, CodeMixin):
    __tablename__ = 'management_action_codes'


class ManagementClassificationCode(Base, CodeMixin):
    __tablename__ = 'management_classification_codes'


class MappingMethodCode(Base, CodeMixin):
    __tablename__ = 'mapping_method_codes'


class ObservationTypeCode(Base, CodeMixin):
    __tablename__ = 'observation_type_codes'


class ParkUnitCode(Base):
    __tablename__ = 'park_unit_codes'

    alpha_code = Column(CHAR(4), unique=True)
    name = Column(VARCHAR(50), unique=True)


class PeoplePresentCode(Base, CodeMixin):
    __tablename__ = 'people_present_codes'


class PlaceNameCode(Base, CodeMixin):
    __tablename__ = 'place_name_codes'


class PreparednessClassificationCode(Base, CodeMixin):
    __tablename__ = 'preparedness_classification_codes'


class ProbableCauseCode(Base, CodeMixin):
    __tablename__ = 'probable_cause_codes'


class ReactionByCode(Base, CodeMixin):
    __tablename__ = 'reaction_by_codes'


class ReactionCode(Base, CodeMixin):
    __tablename__ = 'reaction_codes'


class RelativeLocationCode(Base, CodeMixin):
    __tablename__ = 'relative_location_codes'


class ReportSourceCode(Base, CodeMixin):
    __tablename__ = 'report_source_codes'


class ReportedProbableCause(Base, CodeMixin):
    __tablename__ = 'reported_probable_cause_codes'


class ResidencyCode(Base, CodeMixin):
    __tablename__ = 'residency_codes'


class ResponsibilityClassificationCode(Base, CodeMixin):
    __tablename__ = 'responsibility_classification_codes'


class RoadNameCode(Base, CodeMixin):
    __tablename__ = 'road_name_codes'


class SafetyInfoSourceCode(Base, CodeMixin):
    __tablename__ = 'safety_info_source_codes'


class SexCode(Base, CodeMixin):
    __tablename__ = 'sex_codes'


class StateCode(Base, CodeMixin):
    __tablename__ = 'state_codes'


class StructureInteractionCode(Base, CodeMixin):
    __tablename__ = 'structure_interaction_codes'


class StructureTypeCode(Base, CodeMixin):
    __tablename__ = 'structure_type_codes'


class VisibilityCode(Base, CodeMixin):
    __tablename__ = 'visibility_codes'


# -------- QUERIED TABLES -------- #

class Encounter(Base):
    __tablename__ = 'encounters'

    bear_did_charge = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_cohort_code = Column(INTEGER, ForeignKey(BearCohortCode.code))
    bear_death_count = Column(INTEGER)
    bear_obtained_food = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_spray_distance_m = Column(INTEGER)
    bear_spray_times = Column(INTEGER)
    bear_spray_was_used = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_spray_was_effective = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_spray_was_present = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    bear_was_seen = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    charge_count = Column(INTEGER)
    closest_distance_m = Column(INTEGER)
    consumed_food_description = Column(VARCHAR(255))
    datetime_entered = Column(TIMESTAMP)
    datetime_last_edited = Column(TIMESTAMP)
    daylight_code = Column(INTEGER, ForeignKey(DaylightCode.code))
    duration_code = Column(INTEGER, ForeignKey(DurationCode.code))
    duration_minutes = Column(INTEGER)
    entered_by = Column(VARCHAR(50))
    firearm_was_present = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    food_present_code = Column(INTEGER, ForeignKey(FoodPresentCode.code))
    general_human_activity_code = Column(INTEGER, ForeignKey(GeneralHumanActivityCode.code))
    greatest_charge_distance_m = Column(INTEGER)
    group_size_encounter = Column(INTEGER)
    group_size_total = Column(INTEGER)
    human_group_type_code = Column(INTEGER, ForeignKey(HumanGroupTypeCode.code))
    incident_id = Column(VARCHAR(30))
    initial_bear_action_code = Column(INTEGER, ForeignKey(InitialBearActionCode.code))
    initial_distance_m = Column(INTEGER)
    initial_human_action_code = Column(INTEGER, ForeignKey(InitialHumanActionCode.code))
    last_edited_by = Column(VARCHAR(50))
    making_noise_code = Column(INTEGER, ForeignKey(MakingNoiseCode.code))
    narrative = Column(TEXT)
    observation_type_code = Column(INTEGER, ForeignKey(ObservationTypeCode.code))
    other_bear_cohort = Column(VARCHAR(255))
    other_food_present = Column(VARCHAR(255))
    other_general_human_activity = Column(VARCHAR(255))
    other_human_group_type = Column(VARCHAR(255))
    other_initial_bear_action = Column(VARCHAR(255))
    other_initial_human_action = Column(VARCHAR(255))
    other_making_noise = Column(VARCHAR(255))
    other_observation_type = Column(VARCHAR(255))
    other_report_source = Column(VARCHAR(255))
    other_reported_probable_cause = Column(VARCHAR(255))
    other_safety_info_source = Column(VARCHAR(255))
    park_form_id = Column(VARCHAR(30))
    park_unit_code = Column(CHAR(4))
    people_present_code = Column(INTEGER, ForeignKey(PeoplePresentCode.code))
    received_by = Column(VARCHAR(50))
    received_date = Column(DATE)
    did_receive_safety_info = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    received_time = Column(TIME)
    report_source_code = Column(INTEGER, ForeignKey(ReportSourceCode.code))
    reported_probable_cause_code = Column(INTEGER, ForeignKey(ReportedProbableCause.code))
    safety_info_source_code = Column(INTEGER, ForeignKey(SafetyInfoSourceCode.code))
    start_date = Column(DATE)
    start_time = Column(TIME)
    was_making_noise = Column(INTEGER, ForeignKey(BooleanResponseCode.code))

    # NOTE: foreign_key args required because BooleanResponseCode is foreign keyed to multiple columns creating
    #  relationship ambiguity. https://docs.sqlalchemy.org/en/14/orm/join_conditions.html
    charged = relationship(BooleanResponseCode, foreign_keys=[bear_did_charge])
    bear_cohort = relationship(BearCohortCode)
    food_obtained = relationship(BooleanResponseCode, foreign_keys=[bear_obtained_food])
    bear_spray_used = relationship(BooleanResponseCode, foreign_keys=[bear_spray_was_used])
    bear_spray_effective = relationship(BooleanResponseCode, foreign_keys=[bear_spray_was_effective])
    bear_spray_present = relationship(BooleanResponseCode, foreign_keys=[bear_spray_was_present])
    bear_seen = relationship(BooleanResponseCode, foreign_keys=[bear_was_seen])
    daylight = relationship(DaylightCode)
    firearm_present = relationship(BooleanResponseCode, foreign_keys=[firearm_was_present])
    food_present = relationship(FoodPresentCode)
    general_human_activity = relationship(GeneralHumanActivityCode)
    human_group_type = relationship(HumanGroupTypeCode)
    initial_bear_action = relationship(InitialBearActionCode)
    initial_human_action = relationship(InitialHumanActionCode)
    making_noise_type = relationship(MakingNoiseCode, lazy='joined')
    made_noise = relationship(BooleanResponseCode, foreign_keys=[was_making_noise], lazy='joined')
    observation_type = relationship(ObservationTypeCode)    
    people_present = relationship(PeoplePresentCode)
    received_safety_info = relationship(BooleanResponseCode, foreign_keys=[did_receive_safety_info], lazy='joined')
    report_source = relationship(ReportSourceCode)
    reported_probable_cause = relationship(ReportedProbableCause)
    safety_info_source = relationship(SafetyInfoSourceCode)

    # ORM one-to-many relationships
    # assessment = relationship(Assessment, cascade='all, delete-orphan', passive_deletes=True)
    # attachments = relationship(Attachment, cascade='all, delete-orphan', passive_deletes=True)
    # bears = relationship(Bear, cascade='all, delete-orphan', passive_deletes=True)
    # deterrents_used = relationship(Deterrent, cascade='all, delete-orphan', passive_deletes=True)
    # encounter_locations = relationship(EncounterLocation, cascade='all, delete-orphan', passive_deletes=True)
    # improper_reactions = relationship(ImproperReaction, cascade='all, delete-orphan', passive_deletes=True)
    # people = relationship(Person, cascade='all, delete-orphan', passive_deletes=True)
    # property_damage = relationship(PropertyDamage, cascade='all, delete-orphan', passive_deletes=True)
    # reactions = relationship(Reaction, cascade='all, delete-orphan', passive_deletes=True)
    # structure_interactions = relationship(StructureInteraction, cascade='all, delete-orphan', passive_deletes=True)


class EncounterMixin:
    """
    From the SQLAlchemy docs: "For columns that have foreign keys... the declared_attr 
    decorator is provided so that patterns common to many classes can be defined 
    as callables"

    This isn't just syntactic sugar; it's required to avoid 'sqlalchemy.exc.InvalidRequestError: 
    Columns with foreign keys to other columns must be declared as @declared_attr callables on 
    declarative mixin classes.  For dataclass field() objects, use a lambda:'
    """

    @declared_attr
    def encounter_id(cls):
        return Column(INTEGER, ForeignKey(Encounter.id, ondelete='CASCADE'), nullable=False)
    
    @declared_attr
    def encounter(cls) -> Encounter:
        return relationship(Encounter, backref=backref(cls.__tablename__, passive_deletes=True))


class Assessment(Base, EncounterMixin):
    __tablename__ = 'assessment'

    assessed_by = Column(VARCHAR(50))
    assessment_comments = Column(TEXT)
    data_entry_status_code = Column(INTEGER, ForeignKey(DataEntryStatusCode.code))
    data_quality_code = Column(INTEGER, ForeignKey(DataQualityCode.code))
    human_injury_code = Column(INTEGER, ForeignKey(HumanInjuryCode.code))
    management_action_code = Column(INTEGER, ForeignKey(ManagementActionCode.code))
    management_classification_code = Column(INTEGER, ForeignKey(ManagementClassificationCode.code))
    preparedness_classification_code = Column(INTEGER, ForeignKey(PreparednessClassificationCode.code))
    probable_cause_code = Column(INTEGER, ForeignKey(ProbableCauseCode.code))
    did_react_properly = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    responsibility_classification_code = Column(INTEGER, ForeignKey(ResponsibilityClassificationCode.code))

    data_entry_status = relationship(DataEntryStatusCode)
    data_quality = relationship(DataQualityCode)
    human_injury = relationship(HumanInjuryCode)
    management_action = relationship(ManagementActionCode)
    management_classification = relationship(ManagementClassificationCode)
    probable_cause = relationship(ProbableCauseCode)
    preparedness_classification = relationship(PreparednessClassificationCode)
    react_properly = relationship(BooleanResponseCode, foreign_keys=[did_react_properly])
    responsibility_classification = relationship(ResponsibilityClassificationCode)


class Attachment(Base, EncounterMixin):
    __tablename__ = 'attachments'

    file_type_code = Column(INTEGER, ForeignKey(FileTypeCode.code))
    file_path = Column(VARCHAR(255))
    file_size_kb = Column(INTEGER)
    file_description = Column(TEXT)
    datetime_attached = Column(TIMESTAMP)
    datetime_last_changed = Column(TIMESTAMP)
    last_changed_by = Column(VARCHAR(50))
    mime_type = Column(VARCHAR(50))
    client_filename = Column(VARCHAR(255))
    thumbnail_filename = Column(VARCHAR(255))

    file_type = relationship(FileTypeCode)


class Bear(Base, EncounterMixin):
    __tablename__ = 'bears'

    bear_number = Column(INTEGER)
    bear_age_code = Column(INTEGER, ForeignKey(BearAgeCode.code))
    bear_color_code = Column(INTEGER, ForeignKey(BearColorCode.code))
    bear_description = Column(VARCHAR(255))
    bear_injury_code = Column(INTEGER, ForeignKey(BearInjuryCode.code))
    bear_park_id = Column(VARCHAR(30))
    bear_sex_code = Column(INTEGER, ForeignKey(SexCode.code))
    bear_species_code = Column(INTEGER, ForeignKey(BearSpeciesCode.code))
    was_previously_encountered = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    
    bear_age = relationship(BearAgeCode)
    bear_color = relationship(BearColorCode)
    bear_injury = relationship(BearInjuryCode)
    bear_sex = relationship(SexCode)
    bear_species = relationship(BearSpeciesCode)
    previously_encountered = relationship(BooleanResponseCode, foreign_keys=[was_previously_encountered])


class Deterrent(Base, EncounterMixin):
    __tablename__ = 'deterrents_used'

    bear_behavior_changed = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    deterrent_type_code = Column(INTEGER, ForeignKey(DeterrentTypeCode.code))
    other_deterrent_type = Column(VARCHAR(255))
    times_deployed = Column(INTEGER)

    behavior_changed = relationship(BooleanResponseCode, foreign_keys=[bear_behavior_changed])
    deterrent_type = relationship(DeterrentTypeCode)
    


class EncounterLocation(Base, EncounterMixin):
    __tablename__ = 'encounter_locations'

    backcountry_unit_code = Column(INTEGER, ForeignKey(BackcountryUnitCode.code))
    datum_code = Column(INTEGER, ForeignKey(DatumCode.code))
    habitat_description = Column(VARCHAR(255))
    habitat_type_code = Column(INTEGER, ForeignKey(HabitatTypeCode.code))
    latitude = Column(NUMERIC(10, 7))
    longitude = Column(NUMERIC(10, 7))
    location_accuracy_code = Column(INTEGER, ForeignKey(LocationAccuracyCode.code))
    location_description = Column(TEXT)
    location_source_code = Column(INTEGER, ForeignKey(LocationSourceCode.code))
    mapping_method_code = Column(INTEGER, ForeignKey(MappingMethodCode.code))
    other_habitat_type = Column(VARCHAR(255))
    other_mapping_method = Column(VARCHAR(255))
    other_place_name = Column(VARCHAR(255))
    other_relative_location = Column(VARCHAR(255))
    other_visibility = Column(VARCHAR(255))
    place_name_code = Column(INTEGER, ForeignKey(PlaceNameCode.code))
    relative_location_code = Column(INTEGER, ForeignKey(RelativeLocationCode.code))
    road_mile = Column(NUMERIC(4, 1))
    road_name_code = Column(INTEGER, ForeignKey(RoadNameCode.code))
    visibility_code = Column(INTEGER, ForeignKey(VisibilityCode.code))
    visibility_description = Column(VARCHAR(255))
    visibility_distance_m = Column(INTEGER)

    backcountry_unit = relationship(BackcountryUnitCode)
    datum = relationship(DatumCode)
    habitat_type = relationship(HabitatTypeCode)
    location_accuracy = relationship(LocationAccuracyCode)
    location_source = relationship(LocationSourceCode)
    mapping_method = relationship(MappingMethodCode)
    place_name = relationship(PlaceNameCode)
    relative_location = relationship(RelativeLocationCode)
    road_name = relationship(RoadNameCode)
    visibility = relationship(VisibilityCode)


class ImproperReaction(Base, EncounterMixin):
    __tablename__ = 'improper_reactions'

    improper_reaction_code = Column(INTEGER, ForeignKey(ImproperReactionCode.code))

    improper_reaction = relationship(ImproperReactionCode)


class Person(Base, EncounterMixin):
    __tablename__ = 'people'

    is_primary_person = Column(INTEGER, ForeignKey(BooleanResponseCode.code))
    first_name = Column(VARCHAR(50))
    last_name = Column(VARCHAR(50))
    address_1 = Column(VARCHAR(255))
    address_2 = Column(VARCHAR(255))
    city = Column(VARCHAR(255))
    state_code = Column(INTEGER, ForeignKey(StateCode.code))
    country_code = Column(INTEGER, ForeignKey(CountryCode.code))
    zip_code = Column(VARCHAR(25))
    phone_number = Column(VARCHAR(25))
    email_address = Column(VARCHAR(50))
    residency_code = Column(INTEGER, ForeignKey(ResidencyCode.code))
    sex_code = Column(INTEGER, ForeignKey(SexCode.code))

    primary_person = relationship(BooleanResponseCode, foreign_keys=[is_primary_person])
    state = relationship(StateCode)
    country = relationship(CountryCode)
    residency = relationship(ResidencyCode)
    sex = relationship(SexCode)


class PropertyDamage(Base, EncounterMixin):
    __tablename__ = 'property_damage'

    damage_cost = Column(NUMERIC(11, 2))
    property_value = Column(NUMERIC(11, 2))
    recovered_value = Column(NUMERIC(11, 2))
    property_description = Column(VARCHAR(255))
    quantity = Column(INTEGER)
    recovery_date = Column(DATE)
    was_in_persons_control = Column(INTEGER, ForeignKey(BooleanResponseCode.code))

    in_persons_control = relationship(BooleanResponseCode, foreign_keys=[was_in_persons_control])


class Reaction(Base, EncounterMixin):
    __tablename__ = 'reactions'

    reaction_code = Column(INTEGER, ForeignKey(ReactionCode.code))
    other_reaction = Column(VARCHAR(255))
    reaction_details = Column(VARCHAR(255))
    reaction_order = Column(INTEGER)

    reaction = relationship(ReactionCode)


class StructureInteraction(Base, EncounterMixin):
    __tablename__ = 'structure_interactions'

    other_structure_type = Column(VARCHAR(255))
    structure_description = Column(VARCHAR(255))
    structure_interaction_code = Column(INTEGER, ForeignKey(StructureInteractionCode.code))
    structure_type_code = Column(INTEGER, ForeignKey(StructureTypeCode.code))

    structure_type = relationship(StructureTypeCode)
    structure_interaction = relationship(StructureInteractionCode)
