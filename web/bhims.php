

<?php

include '../../config/bhims-config.php';
// error_reporting(-1);
//ini_set('display_errors', 'On');
// ini_set('html_errors', false);

function runQuery($ipAddress, $port, $dbName, $username, $password, $queryStr, $parameters=array()) {
	/*return result of a postgres query as an array*/

	$conn = pg_connect("hostaddr=$ipAddress port=$port dbname=$dbName user=$username password=$password");
	
	if (!$conn) {
		return array("db connection failed");
	}

	$result = pg_query_params($conn, $queryStr, $parameters);
	if (!$result) {
	  	echo pg_last_error();
	  	return array();
	}

	$resultArray = pg_fetch_all($result) ? pg_fetch_all($result) : array("query returned an empty result");
	return $resultArray;
}


function runQueryWithinTransaction($conn, $queryStr, $parameters=array()) {


	$result = pg_query_params($conn, $queryStr, $parameters);

	if (!$result) {
		$err = array(pg_last_error($conn));
	  	return $err;
	}
	$pgFetch = pg_fetch_all($result);
	return $pgFetch ? $pgFetch : [null];
}


function runCmd($cmd) {
	// can't get this to work for python commands because conda throws
	// an error in conda-script (can't import cli.main)
	
	$pipes = array();
	$process = proc_open(
		$cmd, 
		array(
			0 => array("pipe", "r"), //STDIN
		    1 => array('pipe', 'w'), // STDOUT
		    2 => array('pipe', 'w')  // STDERR
		), 
		$pipes,
		NULL,
		NULL,
		array('bypass_shell' => true)
	);

	if (is_resource($process)) {

	    $stdout = stream_get_contents($pipes[1]);
	    fclose($pipes[1]);

	    $stderr = stream_get_contents($pipes[2]);
	    fclose($pipes[2]);

	    $returnCode = proc_close($process);

		return array(
			"stdout" => $stdout,
			"stderr" => $stderr
		);

	} else {
		return false;
	}
}


function deleteFile($filePath) {

	$fullPath = realpath($filePath);

	if (file_exists($fullPath) && is_writable($fullPath)) {
		unlink($fullPath);
		return true;
	} else {
		return false;
	}
}


function uuid() {
	// from: https://www.php.net/manual/en/function.uniqid.php#94959
	return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',

	// 32 bits for "time_low"
	mt_rand(0, 0xffff), mt_rand(0, 0xffff),

	// 16 bits for "time_mid"
	mt_rand(0, 0xffff),

	// 16 bits for "time_hi_and_version",
	// four most significant bits holds version number 4
	mt_rand(0, 0x0fff) | 0x4000,

	// 16 bits, 8 bits for "clk_seq_hi_res",
	// 8 bits for "clk_seq_low",
	// two most significant bits holds zero and one for variant DCE1.1
	mt_rand(0, 0x3fff) | 0x8000,

	// 48 bits for "node"
	mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
	);
}


function getEnvironment() {
	return strpos(getcwd(), 'git') ? 'dev' : 'prod';
}


function getAttachmentDir($configAttachmentPath) {
	$rootDir = strpos(getcwd(), 'git') ? 'git' : 'prod';
	return preg_replace("/prod/", $rootDir, $configAttachmentPath);
}

// File upload with submit
if (isset($_FILES['uploadedFile'])) {
	
	$fileName = strtolower(preg_replace('/[^\w.]+/', '_', basename($_FILES['uploadedFile']['name'])));
	$fileNameParts = explode('.', $fileName);
	$fileExt = end($fileNameParts);
	$uuid = uuid();
	$attachmentDirPath = getAttachmentDir($attachmentDir);
	$uploadFilePath = "$attachmentDirPath/$uuid.$fileExt";

	if (move_uploaded_file($_FILES['uploadedFile']['tmp_name'], $uploadFilePath)) {
		//$fileTypeCode = $_POST['fileTypeCode'];
		$mimeType = $_FILES['uploadedFile']['type'];
		[$generalType, $specificType] = explode('/', $mimeType);
		$gifFrameIndex = $specificType === 'gif' ? '[0]' : '';
		$fileBasename = reset($fileNameParts);
		$thumbnailName = $uuid . '_thumbnail.jpg';

		// Use ImageMagick if it's an image
		$imgMagickPath = 'C:\\ProgramData\\ImageMagick-7.1.0-Q16-HDRI\\';
		$command = '';
		if ($generalType === 'image') {
			$command = $imgMagickPath . "magick $uploadFilePath$gifFrameIndex -resize 200x200 attachments/$thumbnailName";
			
		} else if ($generalType === 'video' || $mimeType === 'application/octet-stream') {
			$command = $imgMagickPath . "ffmpeg -ss 00:00:01.00 -i $uploadFilePath -vf scale=200:200:force_original_aspect_ratio=decrease -vframes 1 attachments/$thumbnailName";
		}
		$cmdResult = runCmd($command);
		$resultArray = array(
			'filePath' => $uploadFilePath,
			'thumbnailFilename' => boolval($cmdResult) ? $thumbnailName : false,
			'cmdResult' => $cmdResult,
			'command' => $command,
			'mimeType' => $mimeType,
			'substring' => substr($mimeType, 0, 5),
			'fileExt' => $fileExt
		);
		echo json_encode($resultArray);
	} else {
		echo "ERROR: file uploaded was not valid: $uploadFilePath ";
	}

}


if (isset($_POST['action'])) {

	// write json data to the server
	if ($_POST['action'] == 'writeJSON') {
		// check that both the json string and the path to write the json to were given

		if (isset($_POST['jsonString']) && isset($_POST['filePath'])) {
			$success = file_put_contents($_POST['filePath'], $_POST['jsonString']);
			echo $success;
		} else {
			echo false;
		}
	}

	// Get username and user role
	if ($_POST['action'] == 'getUser') {
		if ($_SERVER['AUTH_USER']) {
			$user = preg_replace("/^.+\\\\/", "", strtolower($_SERVER["AUTH_USER"]));
    	} else {
    		echo "ERROR: no auth_user";
    		exit();
    	}
		$sql = "SELECT ad_username as username, role FROM users WHERE ad_username='$user'";
		$userRole = runQuery($dbhost, $dbport, $dbname, $username, $password, $sql);
		
		// Check if the query result is valid. If not, the user probably doesn't exist in the table yet
		$resultValid = false;
		if (is_array($userRole)) {
			$resultValid = isset($userRole[0]['username']);
		}
		if (!$resultValid) {
			// Add the user
			$sql = "INSERT INTO users (ad_username, role) VALUES ('$user', 1);";
			runQuery($dbhost, $dbport, $dbname, $username, $password, $sql);
			// Regardless of whether the query was successful, set the user's role to 'entry'
			$userRole = array(array('username' => $user, 'role' => 1));
		}

		echo json_encode($userRole);
	}


	if ($_POST['action'] == 'getEnvironment') {
		echo getEnvironment();
	}


	if ($_POST['action'] == 'query') {

		if (isset($_POST['queryString'])) {
			$result = runQuery($dbhost, $dbport, $dbname, $username, $password, $_POST['queryString']);
			echo json_encode($result);
		} else {
			echo "ERROR: no query given";//false;
		}

	}


	if ($_POST['action'] == 'paramQuery') {

		if (isset($_POST['queryString']) && isset($_POST['params'])) {
			// If there are multiple SQL statements, execute as a single transaction
			if (gettype($_POST['queryString']) == 'array') {
				$conn = pg_connect("hostaddr=$dbhost port=$dbport dbname=$dbname user=$username password=$password");
				if (!$conn) {
					echo "ERROR: Could not connect DB";
					exit();
				}

				// Begin transaction
				pg_query($conn, 'BEGIN');

				$resultArray = array();
				for ($i = 0; $i < count($_POST['params']); $i++) {
					// Make sure any blank strings are converted to nulls
					$params = $_POST['params'][$i];
					for ($j = 0; $j < count($params); $j++) {
						if ($params[$j] === '') {
							$params[$j] = null;
						}
					}

					$result = runQueryWithinTransaction($conn, $_POST['queryString'][$i], $params);
					if (strpos(json_encode($result), 'ERROR') !== false) {
						// roll back the previous queries
						pg_query($conn, 'ROLLBACK');
						echo $result, " from the query $i ", $_POST['queryString'][$i], ' with params ', json_encode($params);
						exit();
					}

					$resultArray[$i] = $result[0];
				}

				// COMMIT the transaction
				pg_query($conn, 'COMMIT');

				echo json_encode($resultArray);

			} else {
				$params = $_POST['params'];
				for ($j = 0; $j < count($params); $j++) {
					if ($params[$j] === '') {
						$params[$j] = null;
					}
				}
				try {
					$result = runQuery($dbhost, $dbport, $dbname, $username, $password, $_POST['queryString'], $params);
					echo json_encode($result);
				} catch (Exception $e) {
					echo __LINE__.$e->getMessage();
				}
			}
		} else {
			echo "either sqlStatements and/or sqlParameters not given";//false;
		}
	}

	if ($_POST['action'] == 'deleteEncounter') {
		if (isset($_POST['encounterID'])) {//$dbhost, $dbport, $dbname
			$conn = pg_connect("hostaddr=$dbhost port=$dbport dbname=$dbname user=$username password=$password");
			if (!$conn) {
				echo "ERROR: Could not connect DB";
				exit();
			}
			$result = pg_delete($conn, 'encounters', array('id' => $_POST['encounterID']));
			if (!$result) {
				echo "ERROR: could not delete encounter";
			} else {
				echo $result;
			}
		}
	}

	if ($_POST['action'] == 'exportData') {
		if (isset($_POST['exportParams'])) {
			// Call the export script and redirectoy stderr to a text file. After the script finishes, 
			//	read that text file to check if the script ran successfully or not. If the stderrr 
			//	text file is blnak, then the run was sucessful. 
			
			// Format parameter JSON string for Windows command line because escapeshellcmd doesn't work. Need to:
			//	- get rid of backslashes, wchich the json_encode function will adds and Windows interprets as a filepath
			//	- replace each set of double quotes with 2 double-quotes to
			//	- remove the first and last double double-quotes that the replace function added
			$params = substr(str_replace('\\', '', str_replace('"', '""', json_encode($_POST['exportParams']) ) ), 1, -1);

			$cacheDir = "export_cache";
			$runID = uniqid();
			$environment = getEnvironment();
			
			// set stderr text file path with the unique ID for this run so that in case an old stderr.txt file was never properly cleaned up, there's no confusion 
			$stderrPath = $cacheDir . "/stderr" . $runID . ".txt";
			$cmd = "conda activate bhims && python ../py/scripts/export_data.py -e $environment -r $runID -i $params 2> $stderrPath";

			// run the command
			$result = shell_exec($cmd);//

			if (!file_exists($stderrPath)) {
				echo "ERROR: malformed command could not be executed: $cmd";
				exit();
			}

			// read stderr text file
			$stderr = file_get_contents($stderrPath);
			deleteFile($stderrPath);
			$exportFilePath = $cacheDir . "/bhims_export_" . $runID . ".xlsx";
			echo $stderr . "\n" . $exportFilePath;
		}
	}

	if ($_POST['action'] == 'readTextFile') {
		if (isset($_POST['textPath'])) {
			echo file_get_contents($_POST['textPath']);
		}
	}

	if ($_POST['action'] == 'readAttachment') {
		if (isset($_POST['filePath'])) {
			echo readfile($_POST['filePath']);
		}
	}

	if ($_POST['action'] == 'deleteFile') {
		if (isset($_POST['filePath'])) {
			$fileName = basename($_POST['filePath']);
			$attachmentDirPath = getAttachmentDir();
			echo deleteFile("$attachmentDirPath.$fileName") ? 'true' : 'false';
		} else {
			echo 'false';
		}
	}

	if ($_POST['action'] == 'getUUID') {
		echo uuid();
	}
}

?>