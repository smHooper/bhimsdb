from configparser import ConfigParser
from typing import Any, Dict, Optional, Union


__all__ = ['initialize',
           'read']


_config = None


def initialize(environment: str):
    """Initialize a connection to a configuration file.

    Args:
        environment: The environment of the configuration file to read.
    """
    global _config

    config_file = f"//INPDENATERM01/bhims/config/{environment}.config"
    _config = ConfigParser()
    _config.read(config_file)


def read(section: str, option: Optional[str] = None) -> Union[Dict, Any]:
    """Read in a specific section or option from a specific section from the loaded configuration file.

    The global configuration file variable must be initialized prior to reading from it.

    Args
        section: Section of the configuration file to read from.
        option: Option in the requested section of the configuration file to return.

    Returns:
        If a section is requested, a dictionary of all options and values.
        If an option is requested, the option value.
    """
    assert _config, "Config file initialization required before reading."

    if option:
        return _config.get(section, option)
    else:
        return dict(_config.items(section))
