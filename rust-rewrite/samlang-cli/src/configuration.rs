use serde_json::Value;
use std::{fs, path::PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub(super) struct ProjectConfiguration {
  pub(super) source_directory: String,
  pub(super) output_directory: String,
  pub(super) entry_points: Vec<String>,
}

pub(super) enum ConfigurationLoadingFailure {
  UnreadableConfigurationFile,
  UnparsableConfigurationFile,
  NoConfiguration,
}

impl ConfigurationLoadingFailure {
  pub(super) fn to_str(&self) -> &'static str {
    match self {
      ConfigurationLoadingFailure::UnreadableConfigurationFile => "UNREADABLE_CONFIGURATION_FILE",
      ConfigurationLoadingFailure::UnparsableConfigurationFile => "UNPARSABLE_CONFIGURATION_FILE",
      ConfigurationLoadingFailure::NoConfiguration => "NO_CONFIGURATION",
    }
  }
}

fn parse_configuration(configuration_string: &str) -> Option<ProjectConfiguration> {
  let parsed: Value = serde_json::from_str(configuration_string).ok()?;
  parsed.as_object()?;
  let source_directory = if let Some(s) = parsed.get("sourceDirectory") {
    s.as_str()?.to_string()
  } else {
    ".".to_string()
  };
  let output_directory = if let Some(s) = parsed.get("outputDirectory") {
    s.as_str()?.to_string()
  } else {
    "out".to_string()
  };
  let mut entry_points = vec![];
  if let Some(array) = parsed.get("entryPoints") {
    for elem in array.as_array()? {
      entry_points.push(elem.as_str()?.to_string());
    }
  }
  Some(ProjectConfiguration { source_directory, output_directory, entry_points })
}

fn load_project_configuration_custom_start_path(
  start_path: &str,
) -> Result<ProjectConfiguration, ConfigurationLoadingFailure> {
  let start_path_buf = if let Ok(p) = fs::canonicalize(PathBuf::from(start_path)) {
    p
  } else {
    return Err(ConfigurationLoadingFailure::NoConfiguration);
  };
  let mut config_dir_opt = Some(start_path_buf.as_path());
  while let Some(config_dir) = &config_dir_opt {
    let config_path = config_dir.join("sconfig.json");
    if config_path.exists() {
      if let Ok(content) = fs::read_to_string(config_path) {
        if let Some(c) = parse_configuration(&content) {
          return Ok(c);
        } else {
          return Err(ConfigurationLoadingFailure::UnparsableConfigurationFile);
        }
      } else {
        return Err(ConfigurationLoadingFailure::UnreadableConfigurationFile);
      }
    } else {
      config_dir_opt = config_dir.parent();
    }
  }
  Err(ConfigurationLoadingFailure::NoConfiguration)
}

pub(super) fn load_project_configuration(
) -> Result<ProjectConfiguration, ConfigurationLoadingFailure> {
  load_project_configuration_custom_start_path(".")
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;

  #[test]
  fn parser_recognization_tests() {
    assert!(!format!(
      "{:?}",
      ProjectConfiguration {
        source_directory: "".to_string(),
        output_directory: "out".to_string(),
        entry_points: vec![]
      }
    )
    .is_empty());
    assert_eq!(
      ProjectConfiguration {
        source_directory: ".".to_string(),
        output_directory: "out".to_string(),
        entry_points: vec![]
      },
      parse_configuration("{}").unwrap()
    );
    assert_eq!(
      ProjectConfiguration {
        source_directory: "source".to_string(),
        output_directory: "out".to_string(),
        entry_points: vec![]
      },
      parse_configuration("{\"sourceDirectory\": \"source\"}").unwrap()
    );
    assert_eq!(
      ProjectConfiguration {
        source_directory: ".".to_string(),
        output_directory: "out-out".to_string(),
        entry_points: vec![]
      },
      parse_configuration("{\"outputDirectory\": \"out-out\"}").unwrap()
    );
    assert_eq!(
      ProjectConfiguration {
        source_directory: "source".to_string(),
        output_directory: "output".to_string(),
        entry_points: vec!["a".to_string(), "b".to_string()]
      },
      parse_configuration(
        r#"{
          "sourceDirectory": "source",
          "outputDirectory": "output",
          "entryPoints": ["a", "b"]
        }"#
      )
      .unwrap()
    );
  }

  #[test]
  fn parser_rejection_tests() {
    assert!(parse_configuration("").is_none());
    assert!(parse_configuration("null").is_none());
    assert!(parse_configuration("undefined").is_none());
    assert!(parse_configuration("1").is_none());
    assert!(parse_configuration("\"undefined\"").is_none());
    assert!(parse_configuration("{").is_none());
    assert!(parse_configuration("}").is_none());
    assert!(parse_configuration("{ \"sourceDirectory\": 3 }").is_none());
    assert!(parse_configuration("{ \"outputDirectory\": 3 }").is_none());
    assert!(parse_configuration("{ \"entryPoints\": \"3\" }").is_none());
    assert!(parse_configuration("{ \"entryPoints\": [1, \"\"] }").is_none());
  }

  #[test]
  fn loader_no_conf_test() {
    assert_eq!(
      "NO_CONFIGURATION",
      load_project_configuration_custom_start_path("/this/stupid/folder/certainly/does/not/exist")
        .err()
        .unwrap()
        .to_str()
    );
    assert_eq!(
      "NO_CONFIGURATION",
      load_project_configuration_custom_start_path("/").err().unwrap().to_str()
    );
  }

  #[test]
  fn real_fs_unparsable_test() {
    assert_eq!(
      "UNPARSABLE_CONFIGURATION_FILE",
      load_project_configuration_custom_start_path("__fixtures__/unparsable-config")
        .err()
        .unwrap()
        .to_str()
    );
  }

  #[test]
  fn real_fs_unreadable_test() {
    assert_eq!(
      "UNREADABLE_CONFIGURATION_FILE",
      load_project_configuration_custom_start_path("__fixtures__/unreadable-config")
        .err()
        .unwrap()
        .to_str()
    );
  }

  #[test]
  fn real_fs_good_rest() {
    assert_eq!(
      vec!["tests.AllTests".to_string()],
      load_project_configuration().ok().unwrap().entry_points
    );
  }
}
