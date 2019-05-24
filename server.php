<?php
/*! Copyright Social CRM Hub and other contributors. Licensed under MIT *//*
    https://github.com/SCRMHub/AWS-S3-Multipart-JS-Uploader/LICENSE
*/
/**
 * Example Server Setup Code
 * @author Gregory Brine <greg.brine@scrmhub.com>
 */
ini_set("log_errors", 1);
ini_set("error_log", realpath(dirname(__FILE__))."/tmp/php-error.log");

require 'vendor/autoload.php';
require 'config.php';

use Aws\S3\S3Client;
use SCRMHub\Aws\Uploader as ScrmHubUploader;

$client = new S3Client([
    'credentials' => [
        'key'     => AWS_KEY,
        'secret'  => AWS_SECRET,
    ],
    'region'  => 'us-gov-west-1',
    'version' => '2006-03-01',
]);

$uploader = new ScrmHubUploader($client, AWS_BUCKET_NAME);
$uploader->run();
