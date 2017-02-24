<?php
/*! Copyright Social CRM Hub and other contributors. Licensed under MIT *//*
    https://github.com/SCRMHub/AWS-S3-Multipart-JS-Uploader/LICENSE
*/

ini_set("log_errors", 1);
ini_set("error_log", realpath(dirname(__FILE__))."/tmp/php-error.log");

require 'vendor/autoload.php';
require 'config.php';

use Aws\Common\Enum\DateFormat;
use Aws\S3\Model\MultipartUpload\UploadId;
use Aws\S3\S3Client;
use SCRMHub\Aws\Uploader as ScrmHubUploader;

$client = S3Client::factory(array(
    'key'       => AWS_KEY,
    'secret'    => AWS_SECRET
));

$uploader = new ScrmHubUploader($client, AWS_BUCKET_NAME);
$uploader->run();
