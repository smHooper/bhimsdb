

<?php

include '../config/bhims-config.php';

// Connect to the database


function runQuery($ipAddress, $port, $dbName, $username, $password, $queryStr, $parameters=array()) {
	/*return result of a postgres query as an array*/

	$conn = pg_connect("hostaddr=$ipAddress port=$port dbname=$dbName user=$username password=$password");
	
	if (!$conn) {
		return array("db connection failed");
	}

	$result = pg_query_params($conn, $queryStr, $parameters);
	if (!$result) {
	  	echo pg_last_error();
	}

	$resultArray = pg_fetch_all($result) ? pg_fetch_all($result) : array("query returned an empty result");
	return $resultArray;
}


function runQueryWithinTransaction($conn, $queryStr, $parameters=array()) {


	$result = pg_query_params($conn, $queryStr, $parameters);
	if (!$result) {
		$err = pg_last_error();
	  	return $err;
	}

}


function runCmd($cmd) {
	// can't get this to work for python commands because conda throws
	// an error in conda-script (can't import cli.main)
	
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
		array('bypass_shell' => false)
	);

	$resultObj; 

	if (is_resource($process)) {

	    $resultObj->stdout = stream_get_contents($pipes[1]);
	    fclose($pipes[1]);

	    $resultObj->stderr = stream_get_contents($pipes[2]);
	    fclose($pipes[2]);

	    $returnCode = proc_close($process);

	    if ($returnCode) {
	    	return json_encode($resultObj);
	    } else {
	    	return false;
	    }
	} else {
		return false;//json_encode($_SERVER);
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


// File upload with submit
if (isset($_FILES['uploadedFile'])) {
	
	$fileName = strtolower(preg_replace('/[^\w.]+/', '_', basename($_FILES['uploadedFile']['name'])));
	$fileNameParts = explode('.', $fileName);
	$fileExt = end($fileNameParts);
	$uuid = uuid();
	$uploadFilePath = "$attachmentDir/$uuid.$fileExt";

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

	if ($_POST['action'] == 'getUser') {
		if ($_SERVER['AUTH_USER']) {
			echo preg_replace("/^.+\\\\/", "", $_SERVER["AUTH_USER"]);
    	} else {
    		echo "no auth_user";
    	}
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

				// Begin transations
				pg_query($conn, 'BEGIN');

				for ($i = 0; $i < count($_POST['params']); $i++) {
					// Make sure any blank strings are converted to nulls
					$params = $_POST['params'][$i];
					for ($j = 0; $j < count($params); $j++) {
						if ($params[$j] === '') {
							$params[$j] = null;
						}
					}
					$result = runQueryWithinTransaction($conn, $_POST['queryString'][$i], $params);
					if (strpos($result, 'ERROR') !== false) {
						// roll back the previous queries
						pg_query($conn, 'ROLLBACK');
						echo $result, " from the query $i ", $_POST['queryString'][$i], ' with params ', json_encode($params);
						exit();
					}
				}

				// COMMIT the transaction
				pg_query($conn, 'COMMIT');
				echo "success";

			} else {
				$params = $_POST['params'];
				for ($j = 0; $j < count($params); $j++) {
					if ($params[$j] === '') {
						$params[$j] = null;
					}
				}
				$result = runQuery($dbhost, $dbport, $dbname, $username, $password, $_POST['queryString'], $params);
				
				echo json_encode($result);	
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
			echo deleteFile("$attachmentDir.$fileName") ? 'true' : 'false';
		} else {
			echo 'false';
		}
	}

	if ($_POST['action'] == 'getUUID') {
		echo uuid();
	}

	if ($_POST['action'] == 'makeThumbnail') {
		if (isset($_POST['fileName']) && isset($_POST['fileTypeCode'])) {
			$fileName = $_POST['fileName'];
			$fileTypeCode = $_POST['fileTypeCode'];
			//$fileBasename = end(explode(current(explode('.', $fileName)), ;
			$thumbnailName = $fileBasename . '_thumbnail.jpg';
			// Use ImageMagick if it's an image
			$imgMagickPath = 'C:\\ProgramData\\ImageMagick-7.1.0-Q16-HDRI\\';
			$imgCmd = $imgMagickPath . "magick $fileName -resize 200x200 $thumbnailName";
			// Otherwise it's a video, so use ffmpeg
			$videoCmd = $imgMagickPath . "ffmpeg -ss 00:00:01.00 -i $fileName -vf scale=200:200:force_original_aspect_ratio=decrease -vframes 1 attachments/$thumbnailName";
			$cmdResult = runCmd($fileTypeCode == 1 ? $imgCmd : $videoCmd);
			if ($cmdResult) {
				echo $thumbnailName;
			} else {
				echo false;
			}
		} else {
			echo "ERROR: parameters not set";
		}
	}
}

?>